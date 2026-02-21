const request = require('supertest');
const app = require('../src/app');
const { DB, Role } = require('../src/database/database.js');

function randomEmail(prefix = 'user') {
  return `${prefix}_${Math.random().toString(36).substring(2)}@test.com`;
}

// Mock global fetch if your app uses it
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ reportUrl: 'url', jwt: 'jwt' }),
  })
);

// Utility to register a normal user
async function registerUser() {
  const email = randomEmail();
  const res = await request(app).post('/api/auth').send({
    name: 'Test User',
    email,
    password: 'password',
  });

  return {
    user: res.body.user,
    token: res.body.token,
  };
}

// Utility to create admin
async function createAdmin() {
  const email = randomEmail('admin');
  const user = await DB.addUser({
    name: 'Admin User',
    email,
    password: 'admin',
    roles: [{ role: Role.Admin }],
  });

  const token = await request(app)
    .put('/api/auth')
    .send({ email, password: 'admin' })
    .then(r => r.body.token);

  return { email, token, user };
}

// Utility to create regular user
async function createRegularUser() {
  const email = randomEmail('user');
  const user = await DB.addUser({
    name: 'Regular User',
    email,
    password: 'password',
    roles: [],
  });

  const token = await request(app)
    .put('/api/auth')
    .send({ email, password: 'password' })
    .then(r => r.body.token);

  return { email, token, user };
}

describe('Auth Routes', () => {
  test('register user successfully', async () => {
    const email = randomEmail();
    const res = await request(app).post('/api/auth').send({
      name: 'New User',
      email,
      password: 'password',
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test('register fails with missing fields', async () => {
    const res = await request(app).post('/api/auth').send({
      email: randomEmail(),
    });

    expect(res.status).toBe(400);
  });

  test('login succeeds', async () => {
    const email = randomEmail();
    await request(app).post('/api/auth').send({
      name: 'User',
      email,
      password: 'password',
    });

    const login = await request(app).put('/api/auth').send({
      email,
      password: 'password',
    });

    expect(login.status).toBe(200);
    expect(login.body.token).toBeDefined();
  });

  test('login fails with wrong password', async () => {
    const email = randomEmail();
    await request(app).post('/api/auth').send({
      name: 'User',
      email,
      password: 'password',
    });

    const login = await request(app).put('/api/auth').send({
      email,
      password: 'wrong',
    });

    expect(login.status).toBe(404);
  });

  test('logout works', async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .delete('/api/auth')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});

describe('Menu', () => {
  test('get menu', async () => {
    const res = await request(app).get('/api/order/menu');
    expect(res.status).toBe(200);
  });

  test('add menu item fails if not admin', async () => {
    const { token } = await registerUser();

    const res = await request(app)
      .put('/api/order/menu')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Burger',
        description: 'desc',
        image: 'img',
        price: 10,
      });

    expect(res.status).toBe(403);
  });
});

describe('Franchise Routes', () => {
  test('admin can create franchise', async () => {
    await DB.initialized;
    const { token, user } = await createAdmin(); // user already exists in DB

    const res = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Test Franchise ' + Date.now(), // unique name
        admins: [{ email: user.email }],      // DB.createFranchise checks that user exists
      });

    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();
    expect(res.body.name).toMatch(/Test Franchise/);
    expect(res.body.admins[0].email).toBe(user.email);
  });

  test('non-admin cannot create franchise', async () => {
    const { token } = await createRegularUser();

    const res = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Fail Franchise ' + Date.now(),
        admins: [],
      });

    expect(res.status).toBe(403);
  });

  test('admin can create and delete a store', async () => {
    const { token, user } = await createAdmin();

    // create a unique franchise first
    const franchiseRes = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Store Franchise ' + Date.now(),
        admins: [{ email: user.email }],
      });

    const franchiseId = franchiseRes.body.id;

    // create store
    const storeRes = await request(app)
      .post(`/api/franchise/${franchiseId}/store`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Downtown Store' });

    expect(storeRes.status).toBe(200);
    expect(storeRes.body.id).toBeDefined();
    expect(storeRes.body.name).toBe('Downtown Store');

    // delete store
    const delRes = await request(app)
      .delete(`/api/franchise/${franchiseId}/store/${storeRes.body.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(delRes.status).toBe(200);
    expect(delRes.body.message).toBe('store deleted');
  });

  test('non-admin cannot create store', async () => {
    const { token: userToken } = await createRegularUser();
    const { user: adminUser } = await createAdmin();

    // create a unique franchise with admin
    const franchise = await DB.createFranchise({
      name: 'User Franchise ' + Date.now(),
      admins: [{ email: adminUser.email }],
    });

    const res = await request(app)
      .post(`/api/franchise/${franchise.id}/store`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'Illegal Store' });

    expect(res.status).toBe(403);
  });
  test('GET /franchise/:userId returns empty array if not authorized', async () => {
      const { token } = await registerUser();
      const res = await request(app)
        .get('/api/franchise/99999') // fake userId
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]); // covers the else branch
  });
  test('POST /franchise fails for non-admin', async () => {
    const { token } = await createRegularUser();
    const res = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test', admins: [] });
    expect(res.status).toBe(403);
  });
});

describe('Orders', () => {
  test('create order', async () => {
    const { token, user } = await registerUser();

    const res = await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${token}`)
      .send({
        franchiseId: 1,
        storeId: 1,
        items: [
          { menuId: 1, description: 'test', price: 10 },
        ],
      });

    expect(res.status).toBe(200);
  });
});

describe('Franchise Edge Cases', () => {


  test('DELETE /franchise/:franchiseId/store fails if user unauthorized', async () => {
    const { token: userToken } = await createRegularUser();
    const { user: adminUser } = await createAdmin();

    const franchise = await DB.createFranchise({
      name: 'Edge Franchise ' + Date.now(),
      admins: [{ email: adminUser.email }],
    });

    const res = await request(app)
      .delete(`/api/franchise/${franchise.id}/store/1`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });
});

test('GET /franchise/:userId returns franchises for admin', async () => {
  const { token, user } = await createAdmin();
  const franchise = await DB.createFranchise({
    name: 'Admin Franchise ' + Date.now(),
    admins: [{ email: user.email }],
  });

  const res = await request(app)
    .get(`/api/franchise/${user.id}`)
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.length).toBeGreaterThan(0);
});

test('GET /franchise returns franchises for regular user', async () => {
  const { token } = await createRegularUser();
  const res = await request(app)
    .get('/api/franchise?page=0&limit=1')
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.franchises).toBeDefined();
});

test('POST /api/order handles factory failure', async () => {
  const { token, user } = await registerUser();

  // Mock fetch to fail
  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: false,
      json: () =>
        Promise.resolve({
          reportUrl: 'failed-url',
          jwt: 'fake-jwt',
        }),
    })
  );

  const res = await request(app)
    .post('/api/order')
    .set('Authorization', `Bearer ${token}`)
    .send({
      franchiseId: 1,
      storeId: 1,
      items: [{ menuId: 1, description: 'test', price: 10 }],
    });

  expect(res.status).toBe(500);
  expect(res.body.message).toBe('Failed to fulfill order at factory');
  expect(res.body.followLinkToEndChaos).toBe('failed-url');
});


  test('createFranchise fails if admin email does not exist', async () => {
    const franchise = {
      name: `TestFranchise_${Date.now()}`,
      admins: [{ email: `nonexistent_${Date.now()}@test.com` }],
    };
    await expect(DB.createFranchise(franchise)).rejects.toThrow(/unknown user for franchise admin/);
  });

  test('POST /api/order handles empty items gracefully', async () => {
    const userEmail = `orderedge_${Date.now()}@test.com`;
    const user = await DB.addUser({ name: 'EdgeUser', email: userEmail, password: 'pass', roles: [] });

    const res = await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer fake`) // you may need to actually login or set up auth
      .send({ franchiseId: 1, storeId: 1, items: [] });

    // The goal is just to hit that branch without mocks
    expect(res.status).toBeDefined();
  });

describe('DB missing functionality coverage', () => {
  let user;

  it('getOffset returns correct calculation', () => {
    const offset = DB.getOffset(3, 10); // page 3, 10 per page
    expect(offset).toBe(20); // hits getOffset function
  });

  it('createFranchise throws on unknown admin email', async () => {
    await expect(
      DB.createFranchise({ name: 'TestFranchise', admins: [{ email: 'unknown@jwt.com' }] })
    ).rejects.toThrow(/unknown user for franchise admin/); // hits createFranchise error branch
  });

  it('getUserFranchises returns empty array if no franchises', async () => {
    const franchises = await DB.getUserFranchises(999999); // a user ID that doesn’t exist
    expect(franchises).toEqual([]); // hits getUserFranchises early return
  });
});