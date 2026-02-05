const express = require('express');
const app = express();

// routes (add only the ones your backend actually has)
const authRouter = require('./routes/authRouter');
const orderRouter = require('./routes/orderRouter');
const franchiseRouter = require('./routes/franchiseRouter');
const userRouter = require('./routes/userRouter');

app.use('/auth', authRouter);
app.use('/order', orderRouter);
app.use('/franchise', franchiseRouter);
app.use('/user', userRouter);

module.exports = app;
