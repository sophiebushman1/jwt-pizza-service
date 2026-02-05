const request = require('supertest');
const app = require('../src/app');
const { DB, Role } = require('../src/database/database');

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

describe('Auth routes', () => {
  let testUser;
  let token;

  beforeAll(async () => {
    testUser = {
      name: randomName(),
      email: `${randomName()}@test.com`,
      password: 'password',
    };

    const res = await request(app)
      .post('/auth')
      .send(testUser);

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();

    token = res.body.token;
  });

  test('login returns JWT', async () => {
    const res = await request(app)
      .put('/auth')
      .send({
        email: testUser.email,
        password: testUser.password,
      });

    expect(res.status).toBe(200);
    expectValidJwt(res.body.token);
    expect(res.body.user.email).toBe(testUser.email);
  });
});

function expectValidJwt(jwt) {
  expect(jwt).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
}
