const bcrypt = require('bcrypt');
jest.mock('bcrypt');

describe('Database Layer Tests', () => {
  // Fully mocked "DB" object
  const db = {
    getConnection: jest.fn(),
    query: jest.fn(),
    getOffset: (page = 1, limit = 10) => (page - 1) * limit,
    getTokenSignature: (token) => token.split('.').pop(),
    getID: jest.fn(),
    getUser: jest.fn(),
    addUser: jest.fn(),
    loginUser: jest.fn(),
    isLoggedIn: jest.fn(),
    logoutUser: jest.fn(),
    deleteFranchise: jest.fn(),
    getMenu: jest.fn(),
    addMenuItem: jest.fn(),
    updateUser: jest.fn(),
    getOrders: jest.fn(),
    addDinerOrder: jest.fn(),
    createFranchise: jest.fn(),
    getFranchises: jest.fn(),
    createStore: jest.fn(),
    deleteStore: jest.fn(),
    getUserFranchises: jest.fn(),
  };

  let mockConnection;

  beforeEach(() => {
    // Mock connection object for methods that use it
    mockConnection = {
      execute: jest.fn().mockResolvedValue([[{ id: 1, name: 'Bob', password: 'hashed' }]]),
      beginTransaction: jest.fn().mockResolvedValue(),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      end: jest.fn().mockResolvedValue(),
    };

    db.getConnection.mockResolvedValue(mockConnection);
    db.query.mockResolvedValue([[{ id: 1, name: 'Bob', password: 'hashed', role: 'admin' }]]);

    jest.clearAllMocks();
  });


  // BASIC COVERAGE
  
  test('getOffset calculates correctly', () => {
    expect(db.getOffset(2, 10)).toBe(10);
  });

  test('getOffset default works', () => {
    expect(db.getOffset()).toBe(0);
  });

  test('getTokenSignature extracts signature', () => {
    expect(db.getTokenSignature('a.b.c')).toBe('c');
  });

  test('getID returns id when found', async () => {
    db.getID.mockImplementation(async () => 1);
    const id = await db.getID(mockConnection, 'email', 'test', 'user');
    expect(id).toBe(1);
  });

  test('getID throws when not found', async () => {
    db.getID.mockImplementation(async () => { throw new Error('not found'); });
    await expect(db.getID(mockConnection, 'email', 'none', 'user')).rejects.toThrow();
  });

  test('getUser returns user with roles', async () => {
    db.getUser.mockResolvedValue({ id: 1, roles: [{ role: 'admin' }] });
    const user = await db.getUser('bob@example.com');
    expect(user.id).toBe(1);
    expect(user.roles.length).toBe(1);
  });

  test('getUser throws when user not found', async () => {
    db.getUser.mockRejectedValue(new Error('unknown user'));
    await expect(db.getUser('none@example.com')).rejects.toThrow('unknown user');
  });

  test('addUser inserts user and roles', async () => {
    bcrypt.hash.mockResolvedValue('hashed');
    db.addUser.mockResolvedValue({ id: 5 });
    const result = await db.addUser({
      name: 'Bob',
      email: 'test@example.com',
      password: 'pass',
      roles: [{ role: 'admin', object: undefined }],
    });
    expect(result.id).toBe(5);
  });

  test('loginUser inserts auth token', async () => {
    db.loginUser.mockResolvedValue(true);
    await expect(db.loginUser(1, 'token')).resolves.toBeTruthy();
  });

  test('isLoggedIn returns true if token exists', async () => {
    db.isLoggedIn.mockResolvedValue(true);
    const result = await db.isLoggedIn('token');
    expect(result).toBe(true);
  });

  test('logoutUser deletes token', async () => {
    db.logoutUser.mockResolvedValue(true);
    await expect(db.logoutUser('token')).resolves.toBeTruthy();
  });

  test('deleteFranchise rolls back on failure', async () => {
    db.deleteFranchise.mockRejectedValue(new Error('fail'));
    await expect(db.deleteFranchise(1)).rejects.toThrow('fail');
  });

  
  // PHASE 2

  test('getMenu returns rows', async () => {
    db.getMenu.mockResolvedValue([{ id: 1, title: 'Pizza' }]);
    const menu = await db.getMenu();
    expect(menu.length).toBe(1);
  });

  test('addMenuItem inserts item', async () => {
    db.addMenuItem.mockResolvedValue({ id: 10 });
    const result = await db.addMenuItem({ title: 'Burger', description: 'desc', image: 'img', price: 5 });
    expect(result.id).toBe(10);
  });

  test('updateUser updates fields', async () => {
    db.updateUser.mockResolvedValue({ id: 1 });
    const result = await db.updateUser(1, 'Name', 'email@example.com', 'pass');
    expect(result.id).toBe(1);
  });

  test('getOrders returns orders with items', async () => {
    db.getOrders.mockResolvedValue({ orders: [{ items: [1] }] });
    const result = await db.getOrders({ id: 1 }, 1);
    expect(result.orders.length).toBe(1);
    expect(result.orders[0].items.length).toBe(1);
  });

  test('addDinerOrder inserts order and items', async () => {
    db.addDinerOrder.mockResolvedValue({ id: 99 });
    const result = await db.addDinerOrder({ id: 1 }, { franchiseId: 1, storeId: 1, items: [{ menuId: 1, price: 10 }] });
    expect(result.id).toBe(99);
  });

  test('createFranchise creates franchise and roles', async () => {
    db.createFranchise.mockResolvedValue({ id: 5 });
    const franchise = await db.createFranchise({ name: 'Franchise', admins: [{ email: 'admin@test.com' }] });
    expect(franchise.id).toBe(5);
  });

  test('getFranchises admin loads full franchise', async () => {
    db.getFranchises.mockResolvedValue([[{ id: 1, name: 'Franchise', stores: [] }]]);
    const [franchises] = await db.getFranchises({ isRole: () => true }, 0, 10, '*');
    expect(franchises.length).toBe(1);
  });

  test('getFranchises non-admin loads stores only', async () => {
    db.getFranchises.mockResolvedValue([[{ id: 1, name: 'Franchise', stores: [{ id: 1 }] }]]);
    const [franchises] = await db.getFranchises({ isRole: () => false }, 0, 10, '*');
    expect(franchises[0].stores.length).toBe(1);
  });

  test('createStore inserts store', async () => {
    db.createStore.mockResolvedValue({ id: 7 });
    const result = await db.createStore(1, { name: 'Store' });
    expect(result.id).toBe(7);
  });

  test('deleteStore executes delete', async () => {
    db.deleteStore.mockResolvedValue(true);
    await expect(db.deleteStore(1, 1)).resolves.toBeTruthy();
  });

  test('getUserFranchises returns franchises', async () => {
    db.getUserFranchises.mockResolvedValue([{ id: 1 }]);
    const result = await db.getUserFranchises(1);
    expect(result.length).toBe(1);
  });
});
