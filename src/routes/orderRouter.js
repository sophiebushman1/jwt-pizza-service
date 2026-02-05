const express = require('express');
const { DB, Role } = require('../database/database.js');
const { authenticateToken } = require('./authRouter.js');
const { asyncHandler, StatusCodeError } = require('../endpointHelper.js');
const config = require('../config.js');

const orderRouter = express.Router();

// Get menu
orderRouter.get('/menu', asyncHandler(async (req, res) => {
  res.json(await DB.getMenu());
}));

// Add menu item
orderRouter.put(
  '/menu',
  authenticateToken,
  asyncHandler(async (req, res) => {
    if (!req.user.isRole(Role.Admin)) throw new StatusCodeError('unable to add menu item', 403);
    await DB.addMenuItem(req.body);
    res.json(await DB.getMenu());
  })
);

// Get orders
orderRouter.get(
  '/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    res.json(await DB.getOrders(req.user, req.query.page));
  })
);

// Create order
orderRouter.post(
  '/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const order = await DB.addDinerOrder(req.user, req.body);
    const r = await fetch(`${config.factory.url}/api/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${config.factory.apiKey}` },
      body: JSON.stringify({ diner: req.user, order }),
    });
    const j = await r.json();
    if (r.ok) res.json({ order, followLinkToEndChaos: j.reportUrl, jwt: j.jwt });
    else res.status(500).json({ message: 'Failed to fulfill order at factory', followLinkToEndChaos: j.reportUrl });
  })
);

module.exports = orderRouter;
