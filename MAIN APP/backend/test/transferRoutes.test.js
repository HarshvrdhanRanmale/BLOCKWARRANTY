jest.mock('mongoose', () => ({
  connection: { readyState: 1 },
  isValidObjectId: jest.fn(() => true),
}));

jest.mock('../src/models/Product', () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  updateMany: jest.fn(),
  updateOne: jest.fn(),
}));

jest.mock('../src/models/Transfer', () => ({
  create: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  countDocuments: jest.fn(),
}));

jest.mock('../src/middleware/auth', () => ({
  authenticate(req, _res, next) {
    req.user = { walletAddress: String(req.headers['x-test-wallet'] || '').toLowerCase() };
    next();
  },
}));

jest.mock('../src/services/blockchain', () => ({
  contractAt: jest.fn(() => ({
    productExists: jest.fn(async () => true),
    getProduct: jest.fn(async () => ({ currentOwner: '0x0000000000000000000000000000000000000001' })),
  })),
  productKey: jest.fn((productId) => productId),
  verifyTransactionEvent: jest.fn(),
  config: { BLOCKCHAIN_CHAIN_ID: 11155111, CONTRACT_ADDRESS: '0x0000000000000000000000000000000000000001' },
  iface: { encodeFunctionData: jest.fn() },
}));

const express = require('express');
const request = require('supertest');
const Product = require('../src/models/Product');
const Transfer = require('../src/models/Transfer');
const { contractAt } = require('../src/services/blockchain');
const router = require('../src/routes/transferRoutes');

const sellerWallet = '0x0000000000000000000000000000000000000001';
const buyerWallet = '0x0000000000000000000000000000000000000002';
const transferId = '64a000000000000000000001';

function makeTransfer(overrides = {}) {
  return {
    _id: transferId,
    productId: 'BW-TEST-1',
    sellerWallet,
    buyerWallet,
    price: 120,
    currency: 'USD',
    status: 'pending',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('transfer request authorization and state', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/transfers', router);

  beforeEach(() => {
    jest.clearAllMocks();
    Product.findOne.mockReturnValue({ lean: async () => ({
      productId: 'BW-TEST-1',
      publicId: 'passport-1',
      productName: 'Test product',
      walletAddress: sellerWallet,
      invoiceFileId: null,
    }) });
    Transfer.findOne.mockResolvedValue(makeTransfer());
    contractAt.mockReturnValue({
      productExists: jest.fn(async () => true),
      getProduct: jest.fn(async () => ({ currentOwner: sellerWallet })),
    });
  });

  test('prevents an unrelated wallet from viewing a private request', async () => {
    Transfer.findById.mockResolvedValue(makeTransfer());

    const response = await request(app)
      .get(`/api/transfers/${transferId}`)
      .set('x-test-wallet', '0x0000000000000000000000000000000000000003');

    expect(response.status).toBe(403);
    expect(Product.findOne).not.toHaveBeenCalled();
  });

  test('includes the existing product image in the authenticated received request list', async () => {
    Product.findOne.mockReturnValue({ lean: async () => ({
      productId: 'BW-TEST-1',
      publicId: 'passport-1',
      productName: 'Test product',
      brand: 'Test brand',
      category: 'Other',
      productImage: 'data:image/png;base64,cHJvZHVjdA==',
      walletAddress: sellerWallet,
      invoiceFileId: null,
    }) });
    Transfer.find.mockReturnValue({ sort: () => ({ lean: async () => [makeTransfer()] }) });

    const response = await request(app)
      .get('/api/transfers/received')
      .set('x-test-wallet', buyerWallet);

    expect(response.status).toBe(200);
    expect(response.body.transfers[0].product.productImage).toBe('data:image/png;base64,cHJvZHVjdA==');
  });

  test('keeps completed outgoing requests in Sent Requests', async () => {
    const completedTransfer = makeTransfer({ status: 'completed', transactionHash: `0x${'a'.repeat(64)}` });
    Transfer.find.mockReturnValue({ sort: () => ({ lean: async () => [completedTransfer] }) });

    const response = await request(app)
      .get('/api/transfers/sent')
      .set('x-test-wallet', sellerWallet);

    expect(response.status).toBe(200);
    expect(response.body.transfers).toHaveLength(1);
    expect(response.body.transfers[0].status).toBe('completed');
    expect(Transfer.find).toHaveBeenCalledWith({ sellerWallet });
  });

  test('counts only requests whose seller is still the on-chain owner', async () => {
    const thirdTransfer = makeTransfer({ _id: '64a000000000000000000003', productId: 'BW-TEST-3' });
    const receivedTransfer = makeTransfer({ _id: '64a000000000000000000004', productId: 'BW-TEST-4', sellerWallet });
    Transfer.find
      .mockReturnValueOnce({ lean: async () => [makeTransfer(), thirdTransfer] })
      .mockReturnValueOnce({ lean: async () => [receivedTransfer] });
    contractAt.mockReturnValue({
      productExists: jest.fn(async () => true),
      getProduct: jest.fn(async (key) => ({ currentOwner: key === 'BW-TEST-1' ? buyerWallet : sellerWallet })),
    });

    const response = await request(app)
      .get('/api/transfers/pending-counts')
      .set('x-test-wallet', buyerWallet);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ sent: 1, received: 1 });
    expect(Transfer.find).toHaveBeenNthCalledWith(1, {
      sellerWallet: buyerWallet,
      status: { $in: ['pending', 'accepted'] },
    });
    expect(Transfer.find).toHaveBeenNthCalledWith(2, { buyerWallet, status: 'pending' });
  });

  test('does not badge an accepted request after the product is already owned by the buyer', async () => {
    Transfer.find
      .mockReturnValueOnce({ lean: async () => [makeTransfer({ status: 'accepted' })] })
      .mockReturnValueOnce({ lean: async () => [] });
    contractAt.mockReturnValue({
      productExists: jest.fn(async () => true),
      getProduct: jest.fn(async () => ({ currentOwner: buyerWallet })),
    });

    const response = await request(app)
      .get('/api/transfers/pending-counts')
      .set('x-test-wallet', sellerWallet);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ sent: 0, received: 0 });
  });

  test('rejects a duplicate transfer request while one is already pending', async () => {
    // walletAddress already matches the on-chain owner, so the route skips
    // product.save() and goes straight to Transfer.create.
    Product.findOne.mockResolvedValue({ productId: 'BW-TEST-1', walletAddress: sellerWallet, save: jest.fn() });
    Transfer.create.mockRejectedValue(Object.assign(new Error('duplicate key'), { code: 11000 }));

    const response = await request(app)
      .post('/api/transfers')
      .set('x-test-wallet', sellerWallet)
      .send({ productId: 'BW-TEST-1', buyerWallet, price: 100, currency: 'USD' });

    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/already has a pending transfer request/i);
    expect(Transfer.create).toHaveBeenCalledTimes(1);
  });

  test('acceptance only updates request metadata and does not change product ownership', async () => {
    Transfer.findOneAndUpdate.mockResolvedValue(makeTransfer({ status: 'accepted', acceptedAt: new Date() }));

    const response = await request(app)
      .post(`/api/transfers/${transferId}/accept`)
      .set('x-test-wallet', buyerWallet);

    expect(response.status).toBe(200);
    expect(response.body.ownershipTransferred).toBe(false);
    expect(response.body.paymentSupportedOnChain).toBe(false);
    expect(Transfer.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: transferId, buyerWallet, status: 'pending' },
      expect.objectContaining({ $set: expect.objectContaining({ status: 'accepted' }) }),
      { new: true, runValidators: true }
    );
    expect(Product.updateOne).not.toHaveBeenCalled();
  });

  test('returns the rejected state from the buyer rejection action', async () => {
    Transfer.findOneAndUpdate.mockResolvedValue(makeTransfer({ status: 'rejected', rejectedAt: new Date() }));

    const response = await request(app)
      .post(`/api/transfers/${transferId}/reject`)
      .set('x-test-wallet', buyerWallet);

    expect(response.status).toBe(200);
    expect(response.body.transfer.status).toBe('rejected');
    expect(Transfer.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: transferId, buyerWallet, status: 'pending' },
      expect.objectContaining({ $set: expect.objectContaining({ status: 'rejected' }) }),
      { new: true, runValidators: true }
    );
  });

  test('only the intended buyer can accept a pending request', async () => {
    Transfer.findOneAndUpdate.mockResolvedValue(null);

    const response = await request(app)
      .post(`/api/transfers/${transferId}/accept`)
      .set('x-test-wallet', sellerWallet);

    expect(response.status).toBe(409);
    expect(Transfer.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: transferId, buyerWallet: sellerWallet, status: 'pending' },
      expect.any(Object),
      { new: true, runValidators: true }
    );
  });

  test('refuses acceptance when the seller no longer owns the product on-chain', async () => {
    contractAt.mockReturnValue({
      productExists: jest.fn(async () => true),
      getProduct: jest.fn(async () => ({ currentOwner: buyerWallet })),
    });

    const response = await request(app)
      .post(`/api/transfers/${transferId}/accept`)
      .set('x-test-wallet', buyerWallet);

    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/no longer the current on-chain product owner/i);
    expect(Transfer.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
