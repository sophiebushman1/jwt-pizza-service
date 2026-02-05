const request = require('supertest');
const app = require('./app');

const testUser = {
  name: 'pizza diner',
  email: 'test@test.com',
  password: 'a',
};

let token;

beforeAll(async () => {
  testUser.email =
    Math.random().toString(36).substring(2, 10) + '@test.com';

  const res = await request(app)
    .post('/api/auth')
    .send(testUser);

  expect(res.status).toBe(200);
  expect(res.body.token).toBeDefined();

  token = res.body.token;
  expectValidJwt(token);
});

test('login works', async () => {
  const res = await request(app)
    .put('/api/auth')
    .send(testUser);

  expect(res.status).toBe(200);
  expectValidJwt(res.body.token);

  expect(res.body.user).toMatchObject({
    name: testUser.name,
    email: testUser.email,
    roles: [{ role: 'diner' }],
  });
});

test('logout fails without token', async () => {
  const res = await request(app).delete('/api/auth');

  expect(res.status).toBe(401);
  expect(res.body.message).toBe('unauthorized');
});

test('logout works with valid token', async () => {
  const res = await request(app)
    .delete('/api/auth')
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  expect(res.body.message).toBe('logout successful');
});

function expectValidJwt(jwt) {
  expect(jwt).toMatch(
    /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/
  );
}
