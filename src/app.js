const express = require('express');
const app = express();

const authRouter = require('./routes/authRouter');
const orderRouter = require('./routes/orderRouter');
const franchiseRouter = require('./routes/franchiseRouter');
const userRouter = require('./routes/userRouter');

app.use('/auth', authRouter);
app.use('/order', orderRouter);
app.use('/franchise', franchiseRouter);
app.use('/user', userRouter);

app.get('/', (req, res) => res.status(200).send('OK'));

module.exports = app;
