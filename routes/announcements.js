require('dotenv').config();
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { Pool, Client } = require('pg');

const pool = new Pool();

router.get('/', (req, res) => {
  console.log('hey')
});

module.exports = router;