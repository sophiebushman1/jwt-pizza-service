// src/app.js
const express = require('express');
const app = express();

const authRouter = require('./routes/authRouter');
const orderRouter = require('./routes/orderRouter');
const userRouter = require('./routes/userRouter');
const franchiseRouter = require('./routes/franchiseRouter');

app.use('/auth', authRouter);
app.use('/order', orderRouter);
app.use('/user', userRouter);
app.use('/franchise', franchiseRouter);

app.get('/', (req, res) => res.send('Service is running'));

module.exports = app;
