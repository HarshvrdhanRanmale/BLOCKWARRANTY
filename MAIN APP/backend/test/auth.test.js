const request = require('supertest');
const { ethers } = require('ethers');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const authService = require('../src/services/authService');

jest.setTimeout(60000);

let mongod;

describe('BlockWarranty Authentication API, Profile Management & Lifecycle Verification', () => {
  let testWallet;
  let secondWallet;

  beforeAll(async () => {
    testWallet = ethers.Wallet.createRandom();
    secondWallet = ethers.Wallet.createRandom();

    // Start in-memory MongoDB instance — no external dependency, no connection issues
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();

    // Close any existing connections first
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }

    await mongoose.connect(uri);
  });

  afterAll(async () => {
    await authService.clearAll();
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
    if (mongod) {
      await mongod.stop();
    }
  });

  beforeEach(async () => {
    await authService.clearAll();
  });

  describe('Health Check', () => {
    it('should return 200 OK on /health', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('POST /api/auth/nonce', () => {
    it('should reject request when walletAddress is missing', async () => {
      const res = await request(app).post('/api/auth/nonce').send({});
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('walletAddress is required');
    });

    it('should reject request when walletAddress is invalid format', async () => {
      const res = await request(app)
        .post('/api/auth/nonce')
        .send({ walletAddress: '0xinvalid123' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Invalid EVM wallet address');
    });

    it('should generate nonce, challenge message, and expiration for valid address', async () => {
      const res = await request(app)
        .post('/api/auth/nonce')
        .send({ walletAddress: testWallet.address });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.walletAddress).toBe(testWallet.address);
      expect(res.body.nonce).toBeDefined();
      expect(res.body.message).toContain('Welcome to BlockWarranty!');
      expect(res.body.message).toContain(testWallet.address);
      expect(res.body.expiresAt).toBeGreaterThan(Date.now());
    });
  });

  describe('POST /api/auth/verify & User Lifecycle', () => {
    it('should verify signature, create new user with profileComplete: false, and issue JWT', async () => {
      const nonceRes = await request(app)
        .post('/api/auth/nonce')
        .send({ walletAddress: testWallet.address });

      const signature = await testWallet.signMessage(nonceRes.body.message);

      const verifyRes = await request(app).post('/api/auth/verify').send({
        walletAddress: testWallet.address,
        message: nonceRes.body.message,
        signature
      });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);
      expect(verifyRes.body.isNewUser).toBe(true);
      expect(verifyRes.body.user.walletAddress).toBe(testWallet.address);
      expect(verifyRes.body.user.profileComplete).toBe(false);
      expect(verifyRes.body.token).toBeDefined();
    });

    it('should enforce replay attack protection', async () => {
      const nonceRes = await request(app)
        .post('/api/auth/nonce')
        .send({ walletAddress: testWallet.address });

      const signature = await testWallet.signMessage(nonceRes.body.message);

      const firstVerify = await request(app).post('/api/auth/verify').send({
        walletAddress: testWallet.address,
        message: nonceRes.body.message,
        signature
      });
      expect(firstVerify.status).toBe(200);

      const replayVerify = await request(app).post('/api/auth/verify').send({
        walletAddress: testWallet.address,
        message: nonceRes.body.message,
        signature
      });
      expect(replayVerify.status).toBe(401);
    });
  });

  describe('Profile Setup & Returning User Login Flow', () => {
    it('should allow first-time user to update profile name/email and retain it on returning login', async () => {
      // 1. Initial Login
      const nonce1 = await request(app)
        .post('/api/auth/nonce')
        .send({ walletAddress: testWallet.address });

      const sig1 = await testWallet.signMessage(nonce1.body.message);
      const verify1 = await request(app).post('/api/auth/verify').send({
        walletAddress: testWallet.address,
        message: nonce1.body.message,
        signature: sig1
      });

      const token1 = verify1.body.token;

      // 2. Profile Setup (PATCH /api/auth/profile)
      const profileRes = await request(app)
        .patch('/api/auth/profile')
        .set('Authorization', `Bearer ${token1}`)
        .send({ name: 'Harsh', email: 'harsh@example.com' });

      expect(profileRes.status).toBe(200);
      expect(profileRes.body.success).toBe(true);
      expect(profileRes.body.user.name).toBe('Harsh');
      expect(profileRes.body.user.email).toBe('harsh@example.com');
      expect(profileRes.body.user.profileComplete).toBe(true);

      // 3. User logs out (client discards token1)

      // 4. Returning User Login with SAME wallet
      const nonce2 = await request(app)
        .post('/api/auth/nonce')
        .send({ walletAddress: testWallet.address });

      const sig2 = await testWallet.signMessage(nonce2.body.message);
      const verify2 = await request(app).post('/api/auth/verify').send({
        walletAddress: testWallet.address,
        message: nonce2.body.message,
        signature: sig2
      });

      expect(verify2.status).toBe(200);
      expect(verify2.body.isNewUser).toBe(false);
      expect(verify2.body.user.name).toBe('Harsh');
      expect(verify2.body.user.email).toBe('harsh@example.com');
      expect(verify2.body.user.profileComplete).toBe(true);

      const token2 = verify2.body.token;

      // 5. Query /api/auth/me with new token2
      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token2}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.user.walletAddress).toBe(testWallet.address);
      expect(meRes.body.user.name).toBe('Harsh');
    });

    it('should isolate data between two different users (User A vs User B)', async () => {
      // User A
      const nA = await request(app).post('/api/auth/nonce').send({ walletAddress: testWallet.address });
      const sA = await testWallet.signMessage(nA.body.message);
      const vA = await request(app).post('/api/auth/verify').send({ walletAddress: testWallet.address, message: nA.body.message, signature: sA });
      await request(app).patch('/api/auth/profile').set('Authorization', `Bearer ${vA.body.token}`).send({ name: 'Alice' });

      // User B
      const nB = await request(app).post('/api/auth/nonce').send({ walletAddress: secondWallet.address });
      const sB = await secondWallet.signMessage(nB.body.message);
      const vB = await request(app).post('/api/auth/verify').send({ walletAddress: secondWallet.address, message: nB.body.message, signature: sB });
      await request(app).patch('/api/auth/profile').set('Authorization', `Bearer ${vB.body.token}`).send({ name: 'Bob' });

      // Verify User A profile
      const meA = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${vA.body.token}`);
      expect(meA.body.user.name).toBe('Alice');
      expect(meA.body.user.walletAddress).toBe(testWallet.address);

      // Verify User B profile
      const meB = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${vB.body.token}`);
      expect(meB.body.user.name).toBe('Bob');
      expect(meB.body.user.walletAddress).toBe(secondWallet.address);
    });

    it('should issue a new JWT on relogin while keeping walletAddress identical (JWT-A !== JWT-B)', async () => {
      // Login 1
      const n1 = await request(app).post('/api/auth/nonce').send({ walletAddress: testWallet.address });
      const s1 = await testWallet.signMessage(n1.body.message);
      const v1 = await request(app).post('/api/auth/verify').send({ walletAddress: testWallet.address, message: n1.body.message, signature: s1 });
      const jwtA = v1.body.token;

      // Logout endpoint check
      const logoutRes = await request(app).post('/api/auth/logout');
      expect(logoutRes.status).toBe(200);

      // Login 2 (returning)
      const n2 = await request(app).post('/api/auth/nonce').send({ walletAddress: testWallet.address });
      const s2 = await testWallet.signMessage(n2.body.message);
      const v2 = await request(app).post('/api/auth/verify').send({ walletAddress: testWallet.address, message: n2.body.message, signature: s2 });
      const jwtB = v2.body.token;

      expect(jwtA).toBeDefined();
      expect(jwtB).toBeDefined();
      expect(jwtA).not.toBe(jwtB); // Different tokens
      expect(v1.body.user.walletAddress).toBe(v2.body.user.walletAddress); // Same wallet address
    });

    it('should reject authentication if signer address does not match claimed walletAddress', async () => {
      const n = await request(app).post('/api/auth/nonce').send({ walletAddress: testWallet.address });
      // Second wallet signs testWallet's challenge
      const spoofSig = await secondWallet.signMessage(n.body.message);
      const v = await request(app).post('/api/auth/verify').send({
        walletAddress: testWallet.address,
        message: n.body.message,
        signature: spoofSig
      });
      expect(v.status).toBe(401);
      expect(v.body.error).toContain('Signature mismatch');
    });

    it('should allow GET /api/products for dashboard compatibility', async () => {
      const res = await request(app).get('/api/products');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
