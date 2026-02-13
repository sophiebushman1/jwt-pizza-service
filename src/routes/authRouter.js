const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { asyncHandler } = require('../endpointHelper');
const { DB, Role } = require('../database/database');

const authRouter = express.Router();

/* ============================
   Middleware
============================ */

async function setAuthUser(req, res, next) {
  const token = readAuthToken(req);
  if (!token) return next();

  try {
    if (await DB.isLoggedIn(token)) {
      req.user = jwt.verify(token, config.jwtSecret);
      req.user.isRole = (role) =>
        !!req.user.roles.find((r) => r.role === role);
    }
  } catch {
    req.user = null;
  }
  next();
}

function authenticateToken(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: 'unauthorized' });
  }
  next();
}

/* ============================
   Routes
============================ */

// REGISTER
authRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ message: 'name, email, and password are required' });
    }

    const user = await DB.addUser({
      name,
      email,
      password,
      roles: [{ role: Role.Diner }],
    });

    const token = await setAuth(user);
    res.json({ user, token });
  })
);

// LOGIN
authRouter.put(
  '/',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const user = await DB.getUser(email, password);
    const token = await setAuth(user);

    res.json({ user, token });
  })
);

// LOGOUT
authRouter.delete(
  '/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    await DB.logoutUser(readAuthToken(req));
    res.json({ message: 'logout successful' });
  })
);

/* ============================
   Helpers
============================ */

async function setAuth(user) {
  const token = jwt.sign(user, config.jwtSecret);
  await DB.loginUser(user.id, token);
  return token;
}

function readAuthToken(req) {
  const header = req.headers.authorization;
  return header ? header.split(' ')[1] : null;
}

module.exports = {
  authRouter,
  setAuthUser,
  authenticateToken,
  setAuth,
};
