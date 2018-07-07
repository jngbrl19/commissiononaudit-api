require('dotenv').config();
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { Pool, Client } = require('pg');
const generate = require('nanoid/generate');
const nodemailer = require('nodemailer');
const randtoken = require('rand-token');
const verificationEmail = require('../email/verification');

const pool = new Pool();

// mode 1 - verify
// mode 2 - completeRegistration
// mode 3 - login

let registration = {
  employeeId: false,
  email: false,
};

let user = {
  firstName: null,
  lastName: null
};

router.post('/register', (req, res) => {
  switch(req.body.mode) {
    case 1: {
      if(typeof req.body.employeeId === 'number') {
        pool.query('SELECT employeeid from employees WHERE employeeid = $1', [req.body.employeeId], (errQ, resQ) => {
          if(errQ) {
            console.log(errQ)
          } else {
            if(resQ.rowCount > 0) {
              pool.query('SELECT employeeid from accounts WHERE employeeid = $1', [req.body.employeeId], (errQS, resQS) => {
                if(errQS) {
                  console.log(errQ)
                } else {
                  if(resQS.rowCount > 0) {
                    registration.employeeId = false;
                    res.send({
                      status: 409,
                      from: `/login/register`,
                      validationMessage: 'Employee ID is already registered'
                    })
                  } else {
                    registration.employeeId = true;
                    pool.query('SELECT firstname, lastname FROM employees WHERE employeeid = $1', [req.body.employeeId], (errQT, resQT) => {
                      if(errQT) {
                        console.log(errQT)
                      } else {
                        user.firstName = resQT.rows[0].firstname;
                        user.lastName = resQT.rows[0].lastname;

                        res.send({
                          status: 200,
                          from: `/login/employeeid/`,
                          validationMessage: 'Employee ID is valid',
                        })
                      }
                    })
                  }
                }
              });
            } else {
              registration.employeeId = false;
              res.send({
                status: 404,
                from: `/login/register`,
                validationMessage: `Employee ID doesn't exist`
              });
            }
          }
        });
      } else {
        res.send({
          status: 404
        })
      }
      break;
    }

    case 2: {
      pool.query('SELECT email from accounts where email = $1', [req.body.email], (errQ, resQ) => {
        if(errQ) {
          console.log(errQ)
        } else {
          if(resQ.rowCount > 0) {
            registration.email = false;
            res.send({
              status: 409,
              from: `/login/register`,
              validationMessage: 'This e-mail address is already used'
            })
          } else {
            registration.email = true;
            res.send({
              status: 200,
              from: `/login/register`,
              validationMessage: 'E-mail address is valid'
            })
          }
        }
      });
      break;
    }

    case 3: {
      if(!registration.employeeId && !registration.email) {
        return res.send({
          status: 500,
          from: `/login/register`,
          message: 'Something went wrong.',
          registration
        })
      }

      const token = randtoken.generate(30);

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: 'promotionmanagementsystem@gmail.com',
          pass: 'commissiononaudit2018'
        }
      });

      const mailOptions = {
        from: 'Promotion Management System <promotionmanagementsystem@gmail.com>',
        to: req.body.email,
        subject: 'Verify your account',
        html: verificationEmail(user.firstName, token)
      };

      bcrypt.hash(req.body.password, 10, (err, hash) => {
        if(err) {
          console.log(err);
          return res.send({
            status: 500,
            from: `/login/register`,
            message: 'Something went wrong.'
          })
        }

        pool.connect((err, client, done) => {
          const shouldAbort = err => {
            if(err) {
              console.error('Error in transaction', err.stack);
              client.query('ROLLBACK', err => {
                if(err) {
                  console.error('Error in rolling back', err.stack)
                }

                done();
              })
            }

            return !!err;
          };

          client.query('BEGIN', err => {
            if(shouldAbort(err)) {
              return res.send({
                status: 500,
                from: `/login/register`,
                message: 'Something went wrong.'
              })
            }

            client.query('INSERT INTO accounts(employeeid, password, email) VALUES ($1, $2, $3)', [req.body.employeeId, hash, req.body.email], (err, accountsRes) => {
              if(shouldAbort(err)) {
                return res.send({
                  status: 500,
                  from: `/login/register`,
                  message: 'Something went wrong.'
                })
              }

              client.query('INSERT INTO verifications(employeeid, token) VALUES ($1, $2)', [req.body.employeeId, token], (err, verRes) => {
                if(shouldAbort(err)) {
                  return res.send({
                    status: 500,
                    from: `/login/register`,
                    message: 'Something went wrong.'
                  })
                }

                client.query('COMMIT', err => {
                  if(err) {
                    console.error('Error committing transaction', err.stack)
                  }

                  done();

                  transporter.sendMail(mailOptions, (err, info) => {
                    if(err) {
                      console.error('Error in sending e-mail', err);
                      client.query('ROLLBACK', err => {
                        if(err) {
                          console.error('Error in rolling back', err.stack);

                          done();

                          return res.send({
                            status: 500,
                            from: `/login/register`,
                            message: 'Something went wrong.'
                          })
                        }
                      })
                    }

                    const token = jwt.sign({
                      mode: 2,
                      employeeid: req.body.employeeId,
                      email: req.body.email,
                      firstName: user.firstName,
                      lastName: user.lastName
                    }, process.env.JWT_KEY, {
                      expiresIn: '1h'
                    });

                    return res.send({
                      status: 200,
                      message: 'Successfully logged in.',
                      from: `/login/register`,
                      token
                    })
                  });
                })
              })
            })

          })
        });
      });
    }
  }
});

router.post('/verify', (req, res) => {
});

router.post('/', (req, res) => {
  pool.query(`SELECT * FROM employee WHERE username = $1`, [req.body.username], (errorfromquery, findusername) => {
    if(findusername.rows.length < 1)
      return res.send({ message: 'Unauthorized'});
    bcrypt.compare(req.body.password, findusername.rows[0].password, function(err, result) {
      if(result) {
        const token = jwt.sign(
          {
            id: findusername.rows[0].employeeid
          },
          process.env.JWT_KEY,
          {
            expiresIn: '3h'
          }
        );
        return res.status(200).send({
          message: "Successfully logged in.",
          token,
          employeeid: findusername.rows[0].employeeid,
          jobid: findusername.rows[0].jobid,
          name: findusername.rows[0].personaldatasheet.personalInformation.firstName + ' ' + findusername.rows[0].personaldatasheet.personalInformation.surname
        })
      }
      res.send({
        message: 'Unauthorized'
      });
    });
  })
});

module.exports = router;