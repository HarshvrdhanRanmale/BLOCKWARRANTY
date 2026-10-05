const request = require('supertest');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const config = require('../src/config/env');
const Product = require('../src/models/Product');
const ServiceRecord = require('../src/models/ServiceRecord');
const WarrantyClaim = require('../src/models/WarrantyClaim');

let mongod;
const owner = '0x1111111111111111111111111111111111111111';
const other = '0x2222222222222222222222222222222222222222';
const token = (walletAddress) => jwt.sign({ walletAddress }, config.JWT_SECRET, { expiresIn: '5m' });
const tinyPng = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64');

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  if (mongoose.connection.readyState) await mongoose.disconnect();
  await mongod?.stop();
});

beforeEach(async () => {
  await Promise.all([Product.deleteMany({}), ServiceRecord.deleteMany({}), WarrantyClaim.deleteMany({})]);
});

async function createProduct() {
  return Product.create({ productId: 'BW-SERVICE-TEST', walletAddress: owner, productName: 'Test phone' });
}

describe('service and warranty claim draft APIs', () => {
  it('requires a session and hides history from a different wallet', async () => {
    await createProduct();
    const path = '/api/products/BW-SERVICE-TEST/services';
    expect((await request(app).get(path)).status).toBe(401);
    const hidden = await request(app).get(path).set('Authorization', `Bearer ${token(other)}`);
    expect(hidden.status).toBe(404);
  });

  it('stores an explicitly unrecorded service draft with a private document hash', async () => {
    await createProduct();
    const response = await request(app).post('/api/products/BW-SERVICE-TEST/services/drafts')
      .set('Authorization', `Bearer ${token(owner)}`)
      .send({ kind: 'service', fileData: tinyPng, fileType: 'image/png', fileName: 'repair.png', extractedData: { totalCost: '25' }, confirmedData: { serviceDate: '2026-09-30', serviceCenterName: 'Repair Co', workPerformed: 'Battery replaced', partsReplaced: [{ name: 'Battery', quantity: 1, cost: 25 }], totalCost: 25, currency: 'USD' } });
    expect(response.status).toBe(201);
    expect(response.body.draft.blockchainStatus).toBe('not_recorded');
    expect(response.body.draft.documentHash).toBe(crypto.createHash('sha256').update(Buffer.from(tinyPng, 'base64')).digest('hex'));
    expect(response.body.draft.partsReplaced[0].name).toBe('Battery');
    expect(response.body.message).toMatch(/not been recorded on-chain/i);
  });

  it('stores warranty claims separately from product warranty configuration', async () => {
    await createProduct();
    const response = await request(app).post('/api/products/BW-SERVICE-TEST/services/drafts')
      .set('Authorization', `Bearer ${token(owner)}`)
      .send({ kind: 'warranty_claim', fileData: tinyPng, fileType: 'image/png', fileName: 'claim.png', confirmedData: { issue: 'Screen failure', claimDescription: 'Screen stopped working', warrantyCovered: true, claimStatus: 'submitted' } });
    expect(response.status).toBe(201);
    expect(response.body.kind).toBe('warranty_claim');
    expect(await WarrantyClaim.countDocuments()).toBe(1);
    expect(await ServiceRecord.countDocuments()).toBe(0);
  });

  it('refuses to prepare a blockchain transaction without a configured lifecycle contract', async () => {
    await createProduct();
    const response = await request(app).post('/api/products/BW-SERVICE-TEST/services/prepare')
      .set('Authorization', `Bearer ${token(owner)}`).send({ serviceId: 'BWS-FAKE' });
    expect(response.status).toBe(503);
    expect(response.body.message).toMatch(/no deployed lifecycle contract/i);
  });
});
