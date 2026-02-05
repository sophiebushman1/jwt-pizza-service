const request = require('supertest');
const app = require('../src/app');

async function register(email, password = 'password') {
  const res = await request(app)
    .post('/auth')
    .send({ email, password });

  return res.body.token;
}

async function login(email, password = 'password') {
  const res = await request(app)
    .post('/auth/login')
    .send({ email, password });

  return res.body.token;
}

module.exports = {
  register,
  login,
};
