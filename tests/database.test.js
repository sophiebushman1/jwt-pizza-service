const bcrypt = require('bcrypt');
const { DB } = require('../src/database/database'); // destructure the instance

jest.mock('bcrypt');

describe('Database Layer Tests', () => {
  let mockConnection;
  const db = DB; // use the existing instance

  beforeEach(() => {
    // Create a fresh mock connection before each test
    mockConnection = {
      execute: jest.fn(),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      end: jest.fn(),
    };

    // Override getConnection to return the mock connection
    db.getConnection = jest.fn().mockResolvedValue(mockConnection);

    jest.clearAllMocks();
  });

  // =========================
  // BASIC COVERAGE
  // =========================

  test('getOffset calculates correctly', () => {
    expect(db.getOffset(2, 10)).toBe(10);
  });

  test('getOffset default works', () => {
    expect(db.getOffset()).toBe(0);
  });

  test('getTokenSignature extracts signature', () => {
    const sig = db.getTokenSignature('a.b.c');
    expect(sig).toBe('c');
  });

  test('getID returns id when found', async () => {
    mockConnection.execute.mockResolvedValueOnce([[{ id: 1 }]]);
    const id = await db.getID(mockConnection, 'email', 'test', 'user');
    expect(id).toBe(1);
  });

  test('getID throws when not found', async () => {
    mockConnection.execute.mockResolvedValueOnce([[]]);
    await expect(db.getID(mockConnection, 'email', 'test', 'user')).rejects.toThrow();
  });

  test('getUser returns user with roles', async () => {
    mockConnection.execute
      .mockResolvedValueOnce([[{ id: 1, name: 'Bob', password: 'hashed' }]])
      .mockResolvedValueOnce([[{ role: 'admin', objectId: 0 }]]);

    const user = await db.getUser('bob@example.com');
    expect(user.id).toBe(1);
    expect(user.roles.length).toBe(1);
  });

  test('getUser throws when user not found', async () => {
    mockConnection.execute.mockResolvedValueOnce([[]]);
    await expect(db.getUser('none@example.com')).rejects.toThrow();
  });

  test('addUser inserts user and roles', async () => {
    bcrypt.hash.mockResolvedValue('hashed');
    mockConnection.execute
      .mockResolvedValueOnce([{ insertId: 5 }])
      .mockResolvedValueOnce([[]]); // userRole inserts

    const result = await db.addUser({
      name: 'Bob',
      email: 'test@example.com',
      password: 'pass',
      roles: [{ role: 'admin', object: undefined }],
    });

    expect(result.id).toBe(5);
  });

  test('loginUser inserts auth token', async () => {
    mockConnection.execute.mockResolvedValueOnce([[]]);
    await db.loginUser(1, 'token');
    expect(mockConnection.execute).toHaveBeenCalled();
  });

  test('isLoggedIn returns true if token exists', async () => {
    mockConnection.execute.mockResolvedValueOnce([[{ userId: 1 }]]);
    const result = await db.isLoggedIn('token');
    expect(result).toBeTruthy();
  });

  test('logoutUser deletes token', async () => {
    mockConnection.execute.mockResolvedValueOnce([[]]);
    await db.logoutUser('token');
    expect(mockConnection.execute).toHaveBeenCalled();
  });

  test('deleteFranchise rolls back on failure', async () => {
    mockConnection.beginTransaction.mockResolvedValue();
    mockConnection.execute.mockRejectedValue(new Error('fail'));
    mockConnection.rollback.mockResolvedValue();

    await expect(db.deleteFranchise(1)).rejects.toThrow();
    expect(mockConnection.rollback).toHaveBeenCalled();
  });

  // =========================
  // PHASE 2 COVERAGE BOOSTERS
  // =========================

  test('getMenu returns rows', async () => {
    mockConnection.execute.mockResolvedValueOnce([[{ id: 1, title: 'Pizza' }]]);
    const menu = await db.getMenu();
    expect(menu.length).toBe(1);
  });

  test('addMenuItem inserts item', async () => {
    mockConnection.execute.mockResolvedValueOnce([{ insertId: 10 }]);
    const result = await db.addMenuItem({
      title: 'Burger',
      description: 'desc',
      image: 'img',
      price: 5,
    });
    expect(result.id).toBe(10);
  });

  test('updateUser updates fields', async () => {
    bcrypt.hash.mockResolvedValue('hashed');
    mockConnection.execute.mockResolvedValue([[]]);
    jest.spyOn(db, 'getUser').mockResolvedValue({ id: 1 });

    const result = await db.updateUser(1, 'Name', 'email@example.com', 'pass');
    expect(result.id).toBe(1);
  });

  test('getOrders returns orders with items', async () => {
    mockConnection.execute
      .mockResolvedValueOnce([[{ id: 1, franchiseId: 1, storeId: 1, date: new Date() }]])
      .mockResolvedValueOnce([[{ id: 1, menuId: 1, description: 'item', price: 5 }]]);

    const result = await db.getOrders({ id: 1 }, 1);
    expect(result.orders.length).toBe(1);
    expect(result.orders[0].items.length).toBe(1);
  });

  test('addDinerOrder inserts order and items', async () => {
    mockConnection.execute
      .mockResolvedValueOnce([{ insertId: 99 }])
      .mockResolvedValueOnce([[{ id: 1 }]])
      .mockResolvedValueOnce([[]]);

    const result = await db.addDinerOrder(
      { id: 1 },
      {
        franchiseId: 1,
        storeId: 1,
        items: [{ menuId: 1, description: 'Pizza', price: 10 }],
      }
    );

    expect(result.id).toBe(99);
  });

  test('createFranchise creates franchise and roles', async () => {
    mockConnection.execute
      .mockResolvedValueOnce([[{ id: 1, name: 'Admin' }]])
      .mockResolvedValueOnce([{ insertId: 5 }])
      .mockResolvedValueOnce([[]]);

    const franchise = await db.createFranchise({
      name: 'Franchise',
      admins: [{ email: 'admin@test.com' }],
    });

    expect(franchise.id).toBe(5);
  });

  test('getFranchises admin loads full franchise', async () => {
    const fakeUser = { isRole: () => true };

    mockConnection.execute
      .mockResolvedValueOnce([[{ id: 1, name: 'Franchise' }]])
      .mockResolvedValueOnce([[{ id: 1 }]])
      .mockResolvedValueOnce([[{ id: 1 }]]);

    const [franchises] = await db.getFranchises(fakeUser, 0, 10, '*');
    expect(franchises.length).toBe(1);
  });

  test('getFranchises non-admin loads stores only', async () => {
    const fakeUser = { isRole: () => false };

    mockConnection.execute
      .mockResolvedValueOnce([[{ id: 1, name: 'Franchise' }]])
      .mockResolvedValueOnce([[{ id: 1, name: 'Store' }]]);

    const [franchises] = await db.getFranchises(fakeUser, 0, 10, '*');
    expect(franchises[0].stores.length).toBe(1);
  });

  test('createStore inserts store', async () => {
    mockConnection.execute.mockResolvedValueOnce([{ insertId: 7 }]);
    const result = await db.createStore(1, { name: 'Store' });
    expect(result.id).toBe(7);
  });

  test('deleteStore executes delete', async () => {
    mockConnection.execute.mockResolvedValueOnce([[]]);
    await db.deleteStore(1, 1);
    expect(mockConnection.execute).toHaveBeenCalled();
  });

  test('getUserFranchises returns franchises', async () => {
    mockConnection.execute
      .mockResolvedValueOnce([[{ objectId: 1 }]])
      .mockResolvedValueOnce([[{ id: 1, name: 'Franchise' }]])
      .mockResolvedValueOnce([[{ id: 1 }]])
      .mockResolvedValueOnce([[{ id: 1 }]]);

    const result = await db.getUserFranchises(1);
    expect(result.length).toBe(1);
  });
});
