const express = require('express');
const { DB, Role } = require('../database/database.js');
const { authenticateToken, setAuth } = require('./authRouter.js');
const { asyncHandler } = require('../endpointHelper.js');

const userRouter = express.Router();

// Get authenticated user
userRouter.get('/me', authenticateToken, asyncHandler(async (req, res) => {
  res.json(req.user);
}));

// Update user
userRouter.put('/:userId', authenticateToken, asyncHandler(async (req, res) => {
  const userId = Number(req.params.userId);
  if (req.user.id !== userId && !req.user.isRole(Role.Admin)) {
    return res.status(403).json({ message: 'unauthorized' });
  }
  const updatedUser = await DB.updateUser(userId, req.body.name, req.body.email, req.body.password);
  const token = await setAuth(updatedUser);
  res.json({ user: updatedUser, token });
}));

// Delete user (not implemented)
userRouter.delete('/:userId', authenticateToken, asyncHandler(async (req, res) => {
  res.json({ message: 'not implemented' });
}));

// List users (not implemented)
userRouter.get('/', authenticateToken, asyncHandler(async (req, res) => {
  res.json({ message: 'not implemented', users: [], more: false });
}));

module.exports = userRouter;
