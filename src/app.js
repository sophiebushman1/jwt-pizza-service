const express = require('express');
const app = express();

app.use(express.json());

const { authRouter, setAuthUser } = require('./routes/authRouter');

// attach auth user middleware FIRST
app.use(setAuthUser);

// mount router
app.use('/api/auth', authRouter);

// health check
app.get('/', (req, res) => res.status(200).send('OK'));

module.exports = app;
