const express = require('express');
const { DB, Role } = require('../database/database.js');
const { authenticateToken } = require('./authRouter.js');
const { asyncHandler, StatusCodeError } = require('../endpointHelper.js');

const franchiseRouter = express.Router();

// List all franchises
franchiseRouter.get('/', asyncHandler(async (req, res) => {
  const [franchises, more] = await DB.getFranchises(req.user, req.query.page, req.query.limit, req.query.name);
  res.json({ franchises, more });
}));

// List user franchises
franchiseRouter.get('/:userId', authenticateToken, asyncHandler(async (req, res) => {
  const userId = Number(req.params.userId);
  let result = [];
  if (req.user.id === userId || req.user.isRole(Role.Admin)) result = await DB.getUserFranchises(userId);
  res.json(result);
}));

// Create franchise
franchiseRouter.post('/', authenticateToken, asyncHandler(async (req, res) => {
  if (!req.user.isRole(Role.Admin)) throw new StatusCodeError('unable to create a franchise', 403);
  res.json(await DB.createFranchise(req.body));
}));

// Delete franchise
franchiseRouter.delete('/:franchiseId', authenticateToken, asyncHandler(async (req, res) => {
  await DB.deleteFranchise(Number(req.params.franchiseId));
  res.json({ message: 'franchise deleted' });
}));

// Create store
franchiseRouter.post('/:franchiseId/store', authenticateToken, asyncHandler(async (req, res) => {
  const franchise = await DB.getFranchise({ id: Number(req.params.franchiseId) });
  if (!franchise || (!req.user.isRole(Role.Admin) && !franchise.admins.some(a => a.id === req.user.id))) {
    throw new StatusCodeError('unable to create a store', 403);
  }
  res.json(await DB.createStore(franchise.id, req.body));
}));

// Delete store
franchiseRouter.delete('/:franchiseId/store/:storeId', authenticateToken, asyncHandler(async (req, res) => {
  const franchise = await DB.getFranchise({ id: Number(req.params.franchiseId) });
  if (!franchise || (!req.user.isRole(Role.Admin) && !franchise.admins.some(a => a.id === req.user.id))) {
    throw new StatusCodeError('unable to delete a store', 403);
  }
  await DB.deleteStore(Number(req.params.franchiseId), Number(req.params.storeId));
  res.json({ message: 'store deleted' });
}));

module.exports = franchiseRouter;
