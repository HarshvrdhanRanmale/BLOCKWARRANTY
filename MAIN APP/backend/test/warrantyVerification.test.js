const os = require('os');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { CheckWarrantyProvider } = require('../src/services/warrantyProviders/checkWarrantyProvider');
const { WarrantyVerificationService } = require('../src/services/warrantyVerificationService');
const User = require('../src/models/User');
const SupplierInventory = require('../src/models/SupplierInventory');
const Product = require('../src/models/Product');
const supplierVerificationService = require('../src/services/supplierVerificationService');

let mongod;
const supplierWallet = '0x9c90c6074c122ad38ad20a9a7cd0520d6b566ce0';
const customerWallet = '0x8375c8fabceaebf2e4fb5f172bad96b85d20ef4a';

beforeAll(async () => {
  const config = require('../src/config/env');
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(config.MONGODB_URI);
  }
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
});

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    SupplierInventory.deleteMany({}),
    Product.deleteMany({})
  ]);

  // Seed authorized Apple supplier in memory
  await User.create({
    walletAddress: supplierWallet,
    name: 'Apple Authorized Supplies Ltd',
    role: 'supplier',
    supplierProfile: {
      companyName: 'Apple Authorized Supplies Ltd',
      authorizedBrands: ['Apple'],
      verified: true
    }
  });

  // Seed customer user
  await User.create({
    walletAddress: customerWallet,
    name: 'Harsh Dawne',
    role: 'user'
  });
});

describe('Phase 1: CheckWarranty Provider Client Unit Tests', () => {
  it('1. performs successful active-warranty lookup using mock API', async () => {
    const mockProvider = new CheckWarrantyProvider({ apiKey: 'cw_test_key_123' });
    mockProvider._request = jest.fn().mockResolvedValue({
      success: true,
      httpStatus: 200,
      data: {
        status: 'completed',
        message: 'Warranty details retrieved successfully',
        batchId: 'batch_test_001',
        device: {
          brand: 'apple',
          model: 'iPhone 15 Pro Max',
          serialNumber: 'F2LQX90JD01A'
        },
        warranty: {
          status: 'active',
          startDate: '2025-01-15',
          endDate: '2027-01-15',
          coverageType: 'AppleCare+ Active'
        },
        dataQuality: { source: 'official_vendor_api', confidence: 100 },
        credits: { charged: 1, remaining: 99 }
      }
    });

    const result = await mockProvider.lookupDevice({ brand: 'Apple', serialNumber: 'F2LQX90JD01A' });
    expect(result.success).toBe(true);
    expect(result.status).toBe('VERIFIED');
    expect(result.warranty.status).toBe('active');
    expect(result.warranty.endDate).toBe('2027-01-15');
    expect(result.batchId).toBe('batch_test_001');
  });

  it('2. performs successful expired-warranty lookup', async () => {
    const mockProvider = new CheckWarrantyProvider({ apiKey: 'cw_test_key_123' });
    mockProvider._request = jest.fn().mockResolvedValue({
      success: true,
      httpStatus: 200,
      data: {
        status: 'completed',
        batchId: 'batch_test_002',
        device: { brand: 'apple', model: 'iPhone 12', serialNumber: 'EXPIRED12345' },
        warranty: {
          status: 'expired',
          startDate: '2021-01-01',
          endDate: '2022-01-01',
          coverageType: 'Limited Warranty (Expired)'
        },
        credits: { charged: 1 }
      }
    });

    const result = await mockProvider.lookupDevice({ brand: 'apple', serialNumber: 'EXPIRED12345' });
    expect(result.success).toBe(true);
    expect(result.status).toBe('EXPIRED');
    expect(result.warranty.status).toBe('expired');
  });

  it('3. handles product not found (404) correctly', async () => {
    const mockProvider = new CheckWarrantyProvider({ apiKey: 'cw_test_key_123' });
    mockProvider._request = jest.fn().mockResolvedValue({
      success: false,
      provider: 'checkwarranty',
      httpStatus: 404,
      status: 'NOT_FOUND',
      code: 'DEVICE_NOT_FOUND',
      isEligibleForFallback: true,
      message: 'Device serial not found in manufacturer database'
    });

    const result = await mockProvider.lookupDevice({ brand: 'apple', serialNumber: 'UNKNOWN_9999' });
    expect(result.success).toBe(false);
    expect(result.status).toBe('NOT_FOUND');
    expect(result.isEligibleForFallback).toBe(true);
  });

  it('4. detects unsupported brand without making unnecessary API calls', async () => {
    const mockProvider = new CheckWarrantyProvider({ apiKey: 'cw_test_key_123' });
    mockProvider._request = jest.fn();

    const result = await mockProvider.lookupDevice({ brand: 'RolexLuxuryWatch', serialNumber: 'RLX1234' });
    expect(result.success).toBe(false);
    expect(result.status).toBe('UNSUPPORTED');
    expect(result.isEligibleForFallback).toBe(true);
    expect(mockProvider._request).not.toHaveBeenCalled();
  });

  it('5. handles missing API key with controlled config error', async () => {
    const unconfiguredProvider = new CheckWarrantyProvider({ apiKey: '' });
    const result = await unconfiguredProvider.lookupDevice({ brand: 'apple', serialNumber: 'F2LQX90JD01A' });

    expect(result.success).toBe(false);
    expect(result.code).toBe('MISSING_API_KEY');
    expect(result.isEligibleForFallback).toBe(true);
  });

  it('6. handles request timeout and provider outage (503)', async () => {
    const mockProvider = new CheckWarrantyProvider({ apiKey: 'cw_test_key_123' });
    mockProvider._request = jest.fn().mockResolvedValue({
      success: false,
      provider: 'checkwarranty',
      httpStatus: 503,
      status: 'PROVIDER_UNAVAILABLE',
      code: 'REQUEST_TIMEOUT',
      isEligibleForFallback: true,
      message: 'CheckWarranty request timed out after 8000ms.'
    });

    const result = await mockProvider.lookupDevice({ brand: 'apple', serialNumber: 'F2LQX90JD01A' });
    expect(result.status).toBe('PROVIDER_UNAVAILABLE');
    expect(result.isEligibleForFallback).toBe(true);
  });

  it('7. handles rate limiting (429) and auth failure (401)', async () => {
    const mockProvider = new CheckWarrantyProvider({ apiKey: 'cw_bad_key' });
    mockProvider._request = jest.fn().mockResolvedValue({
      success: false,
      provider: 'checkwarranty',
      httpStatus: 401,
      status: 'AUTH_FAILED',
      code: 'UNAUTHORIZED',
      isEligibleForFallback: true,
      message: 'Unauthorized - Missing or invalid API key'
    });

    const authRes = await mockProvider.lookupDevice({ brand: 'apple', serialNumber: 'F2LQX90JD01A' });
    expect(authRes.status).toBe('AUTH_FAILED');
    expect(authRes.isEligibleForFallback).toBe(true);

    mockProvider._request = jest.fn().mockResolvedValue({
      success: false,
      provider: 'checkwarranty',
      httpStatus: 429,
      status: 'RATE_LIMITED',
      code: 'TOO_MANY_REQUESTS',
      isEligibleForFallback: true,
      message: 'Too Many Requests - Rate limit exceeded'
    });

    const rateRes = await mockProvider.lookupDevice({ brand: 'apple', serialNumber: 'F2LQX90JD01A' });
    expect(rateRes.status).toBe('RATE_LIMITED');
    expect(rateRes.isEligibleForFallback).toBe(true);
  });

  it('8. handles malformed response safely without crashing', async () => {
    const mockProvider = new CheckWarrantyProvider({ apiKey: 'cw_test_key' });
    mockProvider._request = jest.fn().mockResolvedValue({
      success: true,
      httpStatus: 200,
      data: { unexpected: 'corrupted payload' }
    });

    const result = await mockProvider.lookupDevice({ brand: 'apple', serialNumber: 'F2LQX90JD01A' });
    expect(result.success).toBe(true);
    expect(result.status).toBe('UNVERIFIED');
    expect(result.isEligibleForFallback).toBe(true);
  });
});

describe('Phase 2: Warranty Verification Orchestrator with Fallback', () => {
  it('9. triggers supplier fallback when provider fails and verifies against supplier inventory', async () => {
    // Seed inventory unit in DB
    await SupplierInventory.create({
      productId: 'BW-APPLE-TEST',
      warrantyId: 'WAR-APPLE-TEST',
      importBatchId: 'BATCH-APPLE-01',
      supplierWalletAddress: supplierWallet,
      brand: 'Apple',
      productName: 'iPhone 15 Pro Max',
      modelNumber: 'A3106',
      manufacturerSerialNumber: 'SYNIP15APPLE01',
      warrantyDurationMonths: 24,
      warrantyStartRule: 'purchase_date',
      status: 'unclaimed'
    });

    // Mock failing CheckWarranty provider
    const failingProvider = new CheckWarrantyProvider({ apiKey: 'cw_key' });
    failingProvider._request = jest.fn().mockResolvedValue({
      success: false,
      status: 'PROVIDER_UNAVAILABLE',
      isEligibleForFallback: true,
      message: 'Gateway Timeout'
    });

    const orchestrator = new WarrantyVerificationService(failingProvider);
    const result = await orchestrator.verifyWarranty({
      brand: 'Apple',
      serialNumber: 'SYNIP15APPLE01'
    });

    expect(result.success).toBe(true);
    expect(result.verificationStatus).toBe('VERIFIED');
    expect(result.verificationSource).toBe('supplier');
    expect(result.verificationProvider).toBe('Supplier Inventory Ledger');
    expect(result.supplierFallbackUsed).toBe(true);
    expect(result.supplierWalletAddress).toBe(supplierWallet);
    expect(result.warrantyDetails.durationMonths).toBe(24);
  });

  it('10. triggers supplier fallback when brand is unsupported by CheckWarranty', async () => {
    // Register Dell supplier
    const dellSupplier = '0x1234567890123456789012345678901234567890';
    await User.create({
      walletAddress: dellSupplier,
      name: 'Sony Authorized Partner',
      role: 'supplier',
      supplierProfile: {
        companyName: 'Sony Authorized Partner',
        authorizedBrands: ['Sony'],
        verified: true
      }
    });

    await SupplierInventory.create({
      productId: 'BW-SONY-TEST',
      warrantyId: 'WAR-SONY-TEST',
      importBatchId: 'BATCH-SONY-01',
      supplierWalletAddress: dellSupplier,
      brand: 'Sony',
      productName: 'Sony WH-1000XM5',
      modelNumber: 'WH1000XM5',
      manufacturerSerialNumber: 'SONY-SERIAL-XM5',
      warrantyDurationMonths: 12,
      warrantyStartRule: 'purchase_date',
      status: 'unclaimed'
    });

    const mockProvider = new CheckWarrantyProvider({ apiKey: 'cw_key' });
    const orchestrator = new WarrantyVerificationService(mockProvider);

    // Sony is not in CheckWarranty supported list (only lenovo, hp, dell, apple)
    const result = await orchestrator.verifyWarranty({
      brand: 'Sony',
      serialNumber: 'SONY-SERIAL-XM5'
    });

    expect(result.success).toBe(true);
    expect(result.verificationStatus).toBe('VERIFIED');
    expect(result.verificationSource).toBe('supplier');
    expect(result.supplierFallbackUsed).toBe(true);
    expect(result.supplierWalletAddress).toBe(dellSupplier);
  });

  it('11. returns PENDING_REVIEW when neither provider nor supplier has sufficient evidence', async () => {
    const mockProvider = new CheckWarrantyProvider({ apiKey: 'cw_key' });
    mockProvider._request = jest.fn().mockResolvedValue({
      success: false,
      status: 'PROVIDER_UNAVAILABLE',
      isEligibleForFallback: true
    });

    const orchestrator = new WarrantyVerificationService(mockProvider);
    const result = await orchestrator.verifyWarranty({
      brand: 'Apple',
      serialNumber: 'UNLISTED-GHOST-SERIAL'
    });

    expect(result.success).toBe(false);
    expect(result.verificationStatus).toBe('PENDING_REVIEW');
    expect(result.verificationSource).toBe('manual');
    expect(result.supplierFallbackUsed).toBe(true);
  });

  it('12. keeps invoice verification completely independent of aggregator', async () => {
    const orchestrator = new WarrantyVerificationService();
    const spy = jest.spyOn(supplierVerificationService, 'processAndValidateCustomerRegistration')
      .mockResolvedValue({ valid: true, validationState: 'auto_passed', submissionId: 'INV-TEST-001' });

    const invoiceResult = await orchestrator.verifyInvoice({
      brand: 'Apple',
      serialNumber: 'SYNIP15APPLE01',
      invoiceNumber: 'INV-2026-9821'
    });

    expect(spy).toHaveBeenCalled();
    expect(invoiceResult.valid).toBe(true);
    expect(invoiceResult.submissionId).toBe('INV-TEST-001');

    spy.mockRestore();
  });
});
