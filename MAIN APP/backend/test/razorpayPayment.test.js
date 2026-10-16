jest.mock('mongoose', () => ({
  connection: { readyState: 1 },
  isValidObjectId: jest.fn(() => true),
}));

jest.mock('../src/models/Product', () => ({
  findOne: jest.fn(),
  find: jest.fn(),
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

// The on-chain owner is controllable per test via global.__CHAIN_OWNER__ so we
// can simulate a product whose ownership has (or has not) moved to the buyer.
jest.mock('../src/services/blockchain', () => ({
  contractAt: jest.fn(() => ({
    productExists: jest.fn(async () => true),
    getProduct: jest.fn(async () => ({ currentOwner: global.__CHAIN_OWNER__ })),
    getAddress: jest.fn(async () => '0x00000000000000000000000000000000000000aa'),
  })),
  productKey: jest.fn((productId) => productId),
  verifyTransactionEvent: jest.fn(),
  getProvider: jest.fn(() => ({})),
  config: { BLOCKCHAIN_CHAIN_ID: 11155111, CONTRACT_ADDRESS: '0x0000000000000000000000000000000000000001', RAZORPAY_KEY_ID: 'rzp_test_key' },
  iface: { encodeFunctionData: jest.fn(() => '0xdeadbeef') },
}));

// Razorpay service is fully mocked so no network or real keys are used.
jest.mock('../src/services/razorpay', () => ({
  isConfigured: jest.fn(() => true),
  createOrder: jest.fn(async () => ({ id: 'order_TEST123' })),
  fetchPayment: jest.fn(),
  verifyCheckoutSignature: jest.fn(),
}));

// Relayer service is fully mocked so no key or network is used.
jest.mock('../src/services/relayer', () => ({
  isConfigured: jest.fn(() => true),
  relayerAddress: jest.fn(() => '0x00000000000000000000000000000000000000bb'),
  transferOwnershipByRelayer: jest.fn(async () => ({ txHash: '0xrelayertx', receipt: { status: 1, hash: '0xrelayertx', blockNumber: 42 } })),
}));

const express = require('express');
const request = require('supertest');
const Product = require('../src/models/Product');
const Transfer = require('../src/models/Transfer');
const razorpay = require('../src/services/razorpay');
const relayer = require('../src/services/relayer');
const { verifyTransactionEvent } = require('../src/services/blockchain');
const router = require('../src/routes/transferRoutes');

const sellerWallet = '0x0000000000000000000000000000000000000001';
const buyerWallet = '0x0000000000000000000000000000000000000002';
const transferId = '64a000000000000000000001';

function makeTransfer(overrides = {}) {
  return {
    _id: transferId,
    productId: 'BW-PAY-1',
    sellerWallet,
    buyerWallet,
    price: 120,
    currency: 'INR',
    status: 'accepted',
    paymentStatus: 'none',
    paymentCurrency: '',
    paymentAmountMinor: null,
    razorpayOrderId: '',
    razorpayPaymentId: '',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    save: jest.fn(async function save() { return this; }),
    ...overrides,
  };
}

describe('Razorpay Test Mode payment integration', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/transfers', router);

  beforeEach(() => {
    jest.clearAllMocks();
    global.__CHAIN_OWNER__ = sellerWallet; // default: seller still owns on-chain
    razorpay.isConfigured.mockReturnValue(true);
    relayer.isConfigured.mockReturnValue(true);
    relayer.transferOwnershipByRelayer.mockResolvedValue({ txHash: '0xrelayertx', receipt: { status: 1, hash: '0xrelayertx', blockNumber: 42 } });
    verifyTransactionEvent.mockResolvedValue({ receipt: { hash: '0xrelayertx', blockNumber: 42 }, block: { timestamp: Math.floor(Date.now() / 1000) } });
    Product.findOne.mockReturnValue({ lean: async () => ({
      productId: 'BW-PAY-1',
      publicId: 'passport-1',
      productName: 'Test product',
      walletAddress: sellerWallet,
      invoiceFileId: null,
    }) });
    // Product.findOne is used both as a lean query (serializeTransfer) and as a
    // savable document (synchronizeCompletedTransfer), so provide both shapes.
    Product.findOne.mockImplementation(() => {
      const doc = {
        productId: 'BW-PAY-1',
        publicId: 'passport-1',
        productName: 'Test product',
        walletAddress: sellerWallet,
        invoiceFileId: null,
        ownershipHistory: [],
        status: 'Active',
        blockchainBlock: null,
        save: async function save() { return this; },
      };
      doc.lean = async () => ({ ...doc, save: undefined });
      return doc;
    });
  });

  test('buyer can create a Razorpay order for an accepted transfer', async () => {
    const transfer = makeTransfer();
    Transfer.findById.mockResolvedValue(transfer);
    razorpay.createOrder.mockResolvedValue({ id: 'order_TEST123' });

    const response = await request(app)
      .post(`/api/transfers/${transferId}/payment/create-order`)
      .set('x-test-wallet', buyerWallet);

    expect(response.status).toBe(200);
    expect(response.body.orderId).toBe('order_TEST123');
    expect(response.body.amount).toBe(12000); // 120 INR -> 12000 paise
    expect(response.body.keyId).toBe('rzp_test_key');
    expect(razorpay.createOrder).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 12000, currency: 'INR' }));
    expect(transfer.paymentStatus).toBe('created');
    expect(transfer.razorpayOrderId).toBe('order_TEST123');
  });

  test('seller cannot create a payment order', async () => {
    Transfer.findById.mockResolvedValue(makeTransfer());
    const response = await request(app)
      .post(`/api/transfers/${transferId}/payment/create-order`)
      .set('x-test-wallet', sellerWallet);
    expect(response.status).toBe(403);
    expect(razorpay.createOrder).not.toHaveBeenCalled();
  });

  test('payment cannot be created before the buyer accepts', async () => {
    Transfer.findById.mockResolvedValue(makeTransfer({ status: 'pending' }));
    const response = await request(app)
      .post(`/api/transfers/${transferId}/payment/create-order`)
      .set('x-test-wallet', buyerWallet);
    expect(response.status).toBe(409);
    expect(razorpay.createOrder).not.toHaveBeenCalled();
  });

  test('verify marks payment paid and automatically transfers ownership on-chain when the relayer succeeds', async () => {
    const transfer = makeTransfer({ paymentStatus: 'created', razorpayOrderId: 'order_TEST123', paymentAmountMinor: 12000, paymentCurrency: 'INR' });
    Transfer.findById.mockResolvedValue(transfer);
    razorpay.verifyCheckoutSignature.mockReturnValue(true);
    razorpay.fetchPayment.mockResolvedValue({ id: 'pay_TEST1', order_id: 'order_TEST123', amount: 12000, currency: 'INR', status: 'captured' });
    // Simulate the relayer transaction moving on-chain ownership to the buyer.
    relayer.transferOwnershipByRelayer.mockImplementation(async () => {
      global.__CHAIN_OWNER__ = buyerWallet;
      return { txHash: '0xrelayertx', receipt: { status: 1, hash: '0xrelayertx', blockNumber: 42 } };
    });

    const response = await request(app)
      .post(`/api/transfers/${transferId}/payment/verify`)
      .set('x-test-wallet', buyerWallet)
      .send({ razorpay_order_id: 'order_TEST123', razorpay_payment_id: 'pay_TEST1', razorpay_signature: 'sig' });

    expect(response.status).toBe(200);
    expect(response.body.paymentVerified).toBe(true);
    expect(response.body.ownershipTransferred).toBe(true);
    expect(response.body.automatic).toBe(true);
    expect(response.body.message).toMatch(/transferred to your ownership/i);
    expect(transfer.paymentStatus).toBe('paid');
    expect(transfer.razorpayPaymentId).toBe('pay_TEST1');
    expect(transfer.status).toBe('completed'); // MongoDB synced only after on-chain confirm
    expect(relayer.transferOwnershipByRelayer).toHaveBeenCalledWith('BW-PAY-1', buyerWallet);
  });

  test('keeps payment paid if the automatic on-chain transfer fails (no data loss, retryable)', async () => {
    const transfer = makeTransfer({ paymentStatus: 'created', razorpayOrderId: 'order_TEST123', paymentAmountMinor: 12000, paymentCurrency: 'INR' });
    Transfer.findById.mockResolvedValue(transfer);
    razorpay.verifyCheckoutSignature.mockReturnValue(true);
    razorpay.fetchPayment.mockResolvedValue({ id: 'pay_TEST1', order_id: 'order_TEST123', amount: 12000, currency: 'INR', status: 'captured' });
    relayer.transferOwnershipByRelayer.mockRejectedValue(Object.assign(new Error('relayer reverted'), { status: 502 }));

    const response = await request(app)
      .post(`/api/transfers/${transferId}/payment/verify`)
      .set('x-test-wallet', buyerWallet)
      .send({ razorpay_order_id: 'order_TEST123', razorpay_payment_id: 'pay_TEST1', razorpay_signature: 'sig' });

    expect(response.status).toBe(200);
    expect(response.body.paymentVerified).toBe(true);
    expect(response.body.ownershipTransferred).toBe(false);
    expect(transfer.paymentStatus).toBe('paid'); // NOT lost
    expect(transfer.status).toBe('accepted'); // not falsely completed
    expect(response.body.finalizeError).toBeTruthy();
  });

  test('a failed Razorpay payment is recorded as failed and never triggers a transfer', async () => {
    const transfer = makeTransfer({ paymentStatus: 'created', razorpayOrderId: 'order_TEST123', paymentAmountMinor: 12000, paymentCurrency: 'INR' });
    Transfer.findById.mockResolvedValue(transfer);
    razorpay.verifyCheckoutSignature.mockReturnValue(true);
    razorpay.fetchPayment.mockResolvedValue({ id: 'pay_TEST1', order_id: 'order_TEST123', amount: 12000, currency: 'INR', status: 'failed' });

    const response = await request(app)
      .post(`/api/transfers/${transferId}/payment/verify`)
      .set('x-test-wallet', buyerWallet)
      .send({ razorpay_order_id: 'order_TEST123', razorpay_payment_id: 'pay_TEST1', razorpay_signature: 'sig' });

    expect(response.status).toBe(409);
    expect(response.body.paymentVerified).toBe(false);
    expect(transfer.paymentStatus).toBe('failed');
    expect(transfer.status).toBe('accepted'); // ownership untouched
    expect(relayer.transferOwnershipByRelayer).not.toHaveBeenCalled();
  });

  test('verify rejects when the checkout signature is invalid', async () => {
    const transfer = makeTransfer({ paymentStatus: 'created', razorpayOrderId: 'order_TEST123', paymentAmountMinor: 12000, paymentCurrency: 'INR' });
    Transfer.findById.mockResolvedValue(transfer);
    razorpay.verifyCheckoutSignature.mockReturnValue(false);

    const response = await request(app)
      .post(`/api/transfers/${transferId}/payment/verify`)
      .set('x-test-wallet', buyerWallet)
      .send({ razorpay_order_id: 'order_TEST123', razorpay_payment_id: 'pay_TEST1', razorpay_signature: 'bad' });

    expect(response.status).toBe(400);
    expect(transfer.paymentStatus).not.toBe('paid');
    expect(razorpay.fetchPayment).not.toHaveBeenCalled();
  });

  test('verify rejects a mismatched payment amount (tampering)', async () => {
    const transfer = makeTransfer({ paymentStatus: 'created', razorpayOrderId: 'order_TEST123', paymentAmountMinor: 12000, paymentCurrency: 'INR' });
    Transfer.findById.mockResolvedValue(transfer);
    razorpay.verifyCheckoutSignature.mockReturnValue(true);
    razorpay.fetchPayment.mockResolvedValue({ id: 'pay_TEST1', order_id: 'order_TEST123', amount: 100, currency: 'INR', status: 'captured' });

    const response = await request(app)
      .post(`/api/transfers/${transferId}/payment/verify`)
      .set('x-test-wallet', buyerWallet)
      .send({ razorpay_order_id: 'order_TEST123', razorpay_payment_id: 'pay_TEST1', razorpay_signature: 'sig' });

    expect(response.status).toBe(409);
    expect(transfer.paymentStatus).not.toBe('paid');
  });

  test('verify is idempotent for the same payment and rejects a different one (replay protection)', async () => {
    const paid = makeTransfer({ status: 'completed', paymentStatus: 'paid', ownershipTransferStatus: 'confirmed', transactionHash: '0xconfirmed', razorpayOrderId: 'order_TEST123', razorpayPaymentId: 'pay_TEST1', paymentAmountMinor: 12000, paymentCurrency: 'INR' });
    Transfer.findById.mockResolvedValue(paid);

    const same = await request(app)
      .post(`/api/transfers/${transferId}/payment/verify`)
      .set('x-test-wallet', buyerWallet)
      .send({ razorpay_order_id: 'order_TEST123', razorpay_payment_id: 'pay_TEST1', razorpay_signature: 'sig' });
    expect(same.status).toBe(200);
    expect(same.body.paymentVerified).toBe(true);

    const different = await request(app)
      .post(`/api/transfers/${transferId}/payment/verify`)
      .set('x-test-wallet', buyerWallet)
      .send({ razorpay_order_id: 'order_TEST123', razorpay_payment_id: 'pay_OTHER', razorpay_signature: 'sig' });
    expect(different.status).toBe(409);
    expect(razorpay.fetchPayment).not.toHaveBeenCalled();
  });

  test('same verified payment retries an incomplete automatic transfer', async () => {
    const paid = makeTransfer({ paymentStatus: 'paid', ownershipTransferStatus: 'pending', razorpayOrderId: 'order_TEST123', razorpayPaymentId: 'pay_TEST1', paymentAmountMinor: 12000, paymentCurrency: 'INR' });
    Transfer.findById.mockResolvedValue(paid);
    relayer.transferOwnershipByRelayer.mockImplementation(async () => {
      global.__CHAIN_OWNER__ = buyerWallet;
      return { txHash: '0xrelayertx', receipt: { status: 1, hash: '0xrelayertx', blockNumber: 42 } };
    });

    const response = await request(app)
      .post(`/api/transfers/${transferId}/payment/verify`)
      .set('x-test-wallet', buyerWallet)
      .send({ razorpay_order_id: 'order_TEST123', razorpay_payment_id: 'pay_TEST1', razorpay_signature: 'same-valid-signature' });

    expect(response.status).toBe(200);
    expect(response.body.paymentVerified).toBe(true);
    expect(response.body.ownershipTransferred).toBe(true);
    expect(paid.status).toBe('completed');
    expect(relayer.transferOwnershipByRelayer).toHaveBeenCalledTimes(1);
  });

  test('seller cannot prepare ownership transfer until payment is verified', async () => {
    Transfer.findById.mockResolvedValue(makeTransfer({ paymentStatus: 'created' }));
    const response = await request(app)
      .post(`/api/transfers/${transferId}/prepare-completion`)
      .set('x-test-wallet', sellerWallet);
    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/razorpay test payment/i);
  });

  test('seller can prepare ownership transfer once payment is verified', async () => {
    Transfer.findById.mockResolvedValue(makeTransfer({ paymentStatus: 'paid' }));
    const response = await request(app)
      .post(`/api/transfers/${transferId}/prepare-completion`)
      .set('x-test-wallet', sellerWallet);
    expect(response.status).toBe(200);
    expect(response.body.ownershipMethod).toBe('transferOwnership');
  });

  test('finalize transfers ownership automatically and is idempotent (no duplicate on-chain transfers)', async () => {
    const transfer = makeTransfer({ paymentStatus: 'paid', razorpayOrderId: 'order_TEST123', razorpayPaymentId: 'pay_TEST1', paymentAmountMinor: 12000, paymentCurrency: 'INR' });
    Transfer.findById.mockResolvedValue(transfer);
    relayer.transferOwnershipByRelayer.mockImplementation(async () => {
      global.__CHAIN_OWNER__ = buyerWallet;
      return { txHash: '0xrelayertx', receipt: { status: 1, hash: '0xrelayertx', blockNumber: 42 } };
    });

    const first = await request(app)
      .post(`/api/transfers/${transferId}/finalize`)
      .set('x-test-wallet', buyerWallet)
      .send({});
    expect(first.status).toBe(200);
    expect(first.body.ownershipTransferred).toBe(true);
    expect(transfer.status).toBe('completed');
    expect(relayer.transferOwnershipByRelayer).toHaveBeenCalledTimes(1);

    // Second call is idempotent: no additional on-chain transfer.
    const second = await request(app)
      .post(`/api/transfers/${transferId}/finalize`)
      .set('x-test-wallet', buyerWallet)
      .send({});
    expect(second.status).toBe(200);
    expect(second.body.ownershipTransferred).toBe(true);
    expect(relayer.transferOwnershipByRelayer).toHaveBeenCalledTimes(1);
  });

  test('finalize only syncs MongoDB when the product is already the buyer on-chain', async () => {
    const transfer = makeTransfer({ paymentStatus: 'paid', razorpayOrderId: 'order_TEST123', razorpayPaymentId: 'pay_TEST1', paymentAmountMinor: 12000, paymentCurrency: 'INR' });
    Transfer.findById.mockResolvedValue(transfer);
    global.__CHAIN_OWNER__ = buyerWallet; // already transferred on-chain

    const response = await request(app)
      .post(`/api/transfers/${transferId}/finalize`)
      .set('x-test-wallet', buyerWallet)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.ownershipTransferred).toBe(true);
    expect(relayer.transferOwnershipByRelayer).not.toHaveBeenCalled(); // no duplicate tx
    expect(transfer.status).toBe('completed');
  });

  test('concurrent finalize requests submit exactly one relayer transaction', async () => {
    const transfer = makeTransfer({ paymentStatus: 'paid', razorpayOrderId: 'order_TEST123', razorpayPaymentId: 'pay_TEST1', paymentAmountMinor: 12000, paymentCurrency: 'INR' });
    Transfer.findById.mockResolvedValue(transfer);
    relayer.transferOwnershipByRelayer.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20)); // widen the race window
      global.__CHAIN_OWNER__ = buyerWallet;
      return { txHash: '0xrelayertx', receipt: { status: 1, hash: '0xrelayertx', blockNumber: 42 } };
    });

    const [first, second] = await Promise.all([
      request(app).post(`/api/transfers/${transferId}/finalize`).set('x-test-wallet', buyerWallet).send({}),
      request(app).post(`/api/transfers/${transferId}/finalize`).set('x-test-wallet', buyerWallet).send({}),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.ownershipTransferred).toBe(true);
    expect(second.body.ownershipTransferred).toBe(true);
    expect(relayer.transferOwnershipByRelayer).toHaveBeenCalledTimes(1); // lock serializes; no duplicate tx
    expect(transfer.status).toBe('completed');
  });

  test('finalize is rejected when the relayer is not configured', async () => {
    Transfer.findById.mockResolvedValue(makeTransfer({ paymentStatus: 'paid' }));
    relayer.isConfigured.mockReturnValue(false);

    const response = await request(app)
      .post(`/api/transfers/${transferId}/finalize`)
      .set('x-test-wallet', buyerWallet)
      .send({});

    expect(response.status).toBe(503);
    expect(relayer.transferOwnershipByRelayer).not.toHaveBeenCalled();
  });

  test('finalize is rejected before payment is verified', async () => {
    Transfer.findById.mockResolvedValue(makeTransfer({ paymentStatus: 'created' }));
    const response = await request(app)
      .post(`/api/transfers/${transferId}/finalize`)
      .set('x-test-wallet', buyerWallet)
      .send({});
    expect(response.status).toBe(409);
    expect(relayer.transferOwnershipByRelayer).not.toHaveBeenCalled();
  });
});
