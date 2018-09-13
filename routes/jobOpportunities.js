require('dotenv').config();
const express = require('express');
const router = express.Router();
const auth = require('../authentication/auth');
const moment = require('moment');
const { Pool } = require('pg');
const fs = require('fs');
const cheerio = require('cheerio');
const cfe = require('check-file-extension');
const request = require('request');
const uuidv1 = require('uuid/v1');
const newlineBr = require('newline-br');

const pool = new Pool();

//for react-select
router.get('/jobs/:id', (req, res) => {
  let officeid;

  const cb3 = (err, resu) => {
    res.send({
      status: 200,
      data: resu.rows
    })
  };

  const cb2 = (err, resu) => {
    let jobids = [];

   resu.rows.forEach(row => {
     row.content.jobs.forEach(job => {
       if(!job.isClosed) {
         jobids.push(job.value)
       }
     })
   });

    const office = {
      office: [{value: officeid}]
    };

    if(jobids.length < 1) {
      jobids.push(0);
    }

    pool.query(`SELECT jobtitle AS label, jobid AS value 
    FROM jobs WHERE office @> $1 AND NOT (jobid = ANY($2::int[])) ORDER BY label`, [office, jobids], cb3);
  };

  const cb = (err, resu) => {
    officeid = resu.rows[0].officeid;

    pool.query('SELECT content FROM jobopportunities WHERE officeid = $1', [officeid], cb2)
  };

  pool.query('SELECT officeid FROM employees WHERE employeeid = $1', [req.params.id], cb);
});

//get job opportunities by officeid
router.get('/:id', (req, res) => {
  const cb2 = (err, resu) => {
    res.send({
      status: 200,
      data: resu.rows
    })
  };

  const cb = (err, resu) => {
    pool.query('SELECT id, content, key FROM jobopportunities WHERE officeid = $1 ORDER BY id DESC', [resu.rows[0].officeid], cb2)
  };

  pool.query('SELECT officeid FROM employees WHERE employeeid = $1', [req.params.id], cb);
});

//view job opportunity by id
router.get('/view/:id', (req, res) => {
  const cb2 = (err, resu) => {
    if(resu.rows.length < 1) {
      res.send({status: 404})
    } else {
      res.send({
        status: 200,
        data: resu.rows
      })
    }
  };

  const cb = (err, resu) => {
    const officeId = resu.rows[0].officeid;

    pool.query('SELECT content, description FROM jobopportunities WHERE id = $1 AND officeid = $2', [req.params.id, officeId], cb2);
  };

  pool.query('SELECT officeid FROM employees WHERE employeeid = $1', [req.query.e], cb);
});

//create job opportunity
router.post('/', (req, res) => {
  const cb2 = (err, resu) => {
    res.send({status: 200})
  };

  const cb = (err, resu) => {
    let  content = req.body.content;

    if(req.body.isSingleDeadline) {
      content.jobs.forEach(o => {
        o.deadline = req.body.content.singleDeadline
      });
    }

    pool.query('INSERT INTO jobopportunities(content, key, officeid, description) VALUES ($1, $2, $3, $4)',
      [req.body.content, uuidv1(), resu.rows[0].officeid, newlineBr(req.body.description.trim())],
      cb2)
  };

  pool.query('SELECT officeid FROM employees WHERE employeeid = $1', [req.body.employeeId], cb);
});

module.exports = router;