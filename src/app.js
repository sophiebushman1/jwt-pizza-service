const express = require('express');
const app = express();
const metrics = require('./metrics');
const logger = require('./logger');

const { setAuthUser } = require('./routes/authRouter');

const { authRouter } = require('./routes/authRouter');
const franchiseRouter = require('./routes/franchiseRouter');
const orderRouter = require('./routes/orderRouter');
const userRouter = require('./routes/userRouter');

app.use(express.json());

app.use(metrics.requestTracker);
app.use(logger.httpLogger);

app.use(setAuthUser);

app.use('/api/auth', authRouter);
app.use('/api/franchise', franchiseRouter);
app.use('/api/order', orderRouter);
app.use('/api/user', userRouter);

// Unhandled exception logger
app.use((err, req, res, next) => {
  logger.exceptionLogger(err, req);
  next(err);
});

module.exports = app;
