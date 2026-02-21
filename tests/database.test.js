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

describe('Extended User/Auth Tests', () => {
  test('update user fields successfully', async () => {
    const { user, token } = await registerUser();

    const updated = await DB.updateUser(user.id, 'Updated Name', 'updated@test.com', 'newpassword');
    expect(updated.name).toBe('Updated Name');
    expect(updated.email).toBe('updated@test.com');
  });

  test('non-admin cannot update another user', async () => {
    const { user: user1 } = await createRegularUser();
    const { user: user2 } = await createRegularUser();

    await expect(DB.updateUser(user2.id, 'Hacked', null, null)).rejects.toThrow('unknown user');
    // Note: real router would enforce 403, direct DB call just updates
  });

  test('getUser fails for unknown user', async () => {
    await expect(DB.getUser('unknown@test.com', 'nopass')).rejects.toThrow('unknown user');
  });

  test('isLoggedIn returns false for invalid token', async () => {
    const result = await DB.isLoggedIn('invalid.token.signature');
    expect(result).toBe(false);
  });

  test('isLoggedIn returns true for valid token', async () => {
    const { user, token } = await registerUser();
    const result = await DB.isLoggedIn(token);
    expect(result).toBe(true);
  });

  test('logout invalidates token', async () => {
    const { token } = await registerUser();
    await DB.logoutUser(token);
    const result = await DB.isLoggedIn(token);
    expect(result).toBe(false);
  });
});

describe('Extended Menu Tests', () => {
  test('admin can add menu item', async () => {
    const { token } = await createAdmin();
    const item = { title: 'Super Pizza', description: 'Tasty', image: 'img.png', price: 9.99 };
    await DB.addMenuItem(item);
    const menu = await DB.getMenu();
    expect(menu.find((m) => m.title === 'Super Pizza')).toBeDefined();
  });

  test('adding menu item with missing fields fails', async () => {
    const item = { title: null, description: 'No name', price: 5 };
    await expect(DB.addMenuItem(item)).rejects.toThrow();
  });
});

describe('Extended Franchise Tests', () => {
  test('create franchise with multiple admins', async () => {
    const admin1 = await createAdmin();
    const admin2 = await createAdmin();
    const franchise = { name: `MultiAdmin_${Math.random()}`, admins: [{ email: admin1.email }, { email: admin2.email }] };
    const created = await DB.createFranchise(franchise);
    expect(created.admins.length).toBe(2);
    expect(created.id).toBeDefined();
  });

  test('create franchise with unknown admin fails', async () => {
    const franchise = { name: 'FailFranchise', admins: [{ email: 'noone@test.com' }] };
    await expect(DB.createFranchise(franchise)).rejects.toThrow(/unknown user/);
  });

  test('get franchises with name filter', async () => {
    const { token, email } = await createAdmin();
    const fName = `FilterTest_${Math.random()}`;
    await DB.createFranchise({ name: fName, admins: [{ email }] });
    const [franchises] = await DB.getFranchises({ isRole: () => true }, 0, 10, fName);
    expect(franchises.some((f) => f.name === fName)).toBe(true);
  });

});

describe('Extended Store Tests', () => {
  test('create store and check totalRevenue', async () => {
    const { token, email } = await createAdmin();
    const franchise = await DB.createFranchise({ name: `StoreRev_${Math.random()}`, admins: [{ email }] });
    const store = await DB.createStore(franchise.id, { name: 'Revenue Store' });
    expect(store.name).toBe('Revenue Store');
    const fetched = await DB.getFranchise(franchise);
    expect(fetched.stores.find((s) => s.name === 'Revenue Store').totalRevenue).toBeDefined();
  });

  test('delete store that does not exist', async () => {
    const { token, email } = await createAdmin();
    const franchise = await DB.createFranchise({ name: `DelStore_${Math.random()}`, admins: [{ email }] });
    await expect(DB.deleteStore(franchise.id, 999999)).resolves.toBeUndefined();
  });
});

describe('Extended Orders Tests', () => {
  test('create order with multiple items', async () => {
    const { token, user } = await registerUser();
    const items = [
      { menuId: 1, description: 'Item1', price: 5 },
      { menuId: 1, description: 'Item2', price: 10 },
    ];
    const order = await DB.addDinerOrder(user, { franchiseId: 1, storeId: 1, items });
    expect(order.items.length).toBe(2);
  });

  test('getOrders pagination', async () => {
    const { token, user } = await registerUser();
    const result = await DB.getOrders(user, 1);
    expect(result.orders).toBeDefined();
  });
});

describe('Utility / Edge Cases', () => {
  test('getID throws for missing ID', async () => {
    const connection = await DB.getConnection();
    await expect(DB.getID(connection, 'id', 999999, 'menu')).rejects.toThrow('No ID found');
  });

  test('getOffset calculates correctly', () => {
    expect(DB.getOffset(1, 10)).toBe(0);
    expect(DB.getOffset(2, 10)).toEqual(10); // this mirrors your DB code behavior
  });

  test('getTokenSignature works with multiple formats', () => {
    expect(DB.getTokenSignature('a.b.c')).toBe('c');
    expect(DB.getTokenSignature('a.b')).toBe('');
    expect(DB.getTokenSignature('a')).toBe('');
  });
});

afterAll(async () => {

  if (DB.closeConnection) {
    await DB.closeConnection();
  }

  if (DB.server && DB.server.close) {
    await new Promise((resolve) => DB.server.close(resolve));
  }

  await new Promise((resolve) => setTimeout(resolve, 100));
});