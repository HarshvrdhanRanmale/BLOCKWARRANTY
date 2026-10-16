jest.mock('mongoose', () => ({
  connection: { readyState: 1 },
  isValidObjectId: jest.fn(() => true),
}));

jest.mock('../src/models/Product', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  updateOne: jest.fn(),
}));

jest.mock('../src/models/Transfer', () => ({ exists: jest.fn() }));

jest.mock('../src/middleware/auth', () => ({
  authenticate(req, _res, next) {
    req.user = { walletAddress: String(req.headers['x-test-wallet'] || '').toLowerCase() };
    next();
  },
}));

jest.mock('../src/services/blockchain', () => ({
  productKey: jest.fn((productId) => productId),
  verifyTransactionEvent: jest.fn(),
  contractAt: jest.fn(),
  getProvider: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const Product = require('../src/models/Product');
const { contractAt } = require('../src/services/blockchain');
const router = require('../src/routes/productRoutes');

const oldOwner = '0x0000000000000000000000000000000000000001';
const newOwner = '0x0000000000000000000000000000000000000002';

function mockProductRows(rows) {
  Product.find.mockReturnValue({
    sort: () => ({ lean: async () => rows }),
  });
}

describe('My Products on-chain ownership filtering', () => {
  const app = express();
  app.use('/api/products', router);

  beforeEach(() => {
    jest.clearAllMocks();
    Product.updateOne.mockResolvedValue({ acknowledged: true });
  });

  test('hides a transferred product from the old owner and synchronizes the cached owner', async () => {
    const product = { _id: 'product-db-id', productId: 'BW-1', walletAddress: oldOwner, blockchainStatus: 'confirmed' };
    mockProductRows([product]);
    contractAt.mockReturnValue({
      productExists: jest.fn(async () => true),
      getProduct: jest.fn(async () => ({ currentOwner: newOwner })),
    });

    const response = await request(app).get('/api/products').set('x-test-wallet', oldOwner);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
    expect(Product.updateOne).toHaveBeenCalledWith(
      { _id: product._id },
      { $set: { walletAddress: newOwner } }
    );
  });

  test('shows a transferred product to its on-chain owner even when MongoDB is stale', async () => {
    const product = { _id: 'product-db-id', productId: 'BW-1', walletAddress: oldOwner, blockchainStatus: 'confirmed' };
    mockProductRows([product]);
    contractAt.mockReturnValue({
      productExists: jest.fn(async () => true),
      getProduct: jest.fn(async () => ({ currentOwner: newOwner })),
    });

    const response = await request(app).get('/api/products').set('x-test-wallet', newOwner);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].walletAddress).toBe(newOwner);
  });

  test('retains an unregistered product only for its recorded wallet', async () => {
    const product = { _id: 'product-db-id', productId: 'BW-1', walletAddress: oldOwner, blockchainStatus: 'pending' };
    mockProductRows([product]);
    contractAt.mockReturnValue({
      productExists: jest.fn(async () => false),
      getProduct: jest.fn(),
    });

    const ownerResponse = await request(app).get('/api/products').set('x-test-wallet', oldOwner);
    const otherResponse = await request(app).get('/api/products').set('x-test-wallet', newOwner);

    expect(ownerResponse.body).toHaveLength(1);
    expect(otherResponse.body).toEqual([]);
  });
});