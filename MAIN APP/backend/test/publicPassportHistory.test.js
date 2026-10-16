jest.mock('../src/models/Product', () => ({}));
jest.mock('../src/models/ServiceRecord', () => ({}));
jest.mock('../src/models/WarrantyClaim', () => ({}));
jest.mock('../src/services/blockchain', () => ({
  contractAt: jest.fn(),
  productKey: jest.fn(),
  hashDetails: jest.fn(),
  getProvider: jest.fn(),
  config: {},
  iface: {},
}));

const { publicOwnershipHistory, publicTimeline, warrantyProjection } = require('../src/routes/publicProductRoutes');

describe('public Product Passport ownership timeline', () => {
  const product = {
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    ownershipHistory: [
      {
        from: '0x1111111111111111111111111111111111111111',
        to: '0x2222222222222222222222222222222222222222',
        transferredAt: new Date('2026-10-05T10:00:00.000Z'),
        txHash: `0x${'a'.repeat(64)}`,
      },
      {
        from: '0x2222222222222222222222222222222222222222',
        to: '0x3333333333333333333333333333333333333333',
        transferredAt: new Date('2026-10-08T10:00:00.000Z'),
        txHash: `0x${'b'.repeat(64)}`,
      },
    ],
  };

  test('projects confirmed ownership changes without exposing owner wallet addresses', () => {
    const history = publicOwnershipHistory(product);

    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({
      date: '2026-10-05T10:00:00.000Z',
      title: 'Ownership transferred on-chain',
      txHash: `0x${'a'.repeat(64)}`,
    });
    expect(JSON.stringify(history)).not.toContain('0x1111111111111111111111111111111111111111');
  });

  test('includes ownership and confirmed service events in chronological timeline with registration fallback', () => {
    const timeline = publicTimeline(product, { registeredAt: null, verified: false }, [{
      type: 'service',
      date: new Date('2026-10-06T10:00:00.000Z'),
      serviceType: 'Repair',
      txHash: `0x${'c'.repeat(64)}`,
    }]);

    expect(timeline.map((event) => event.title)).toEqual([
      'Product registered in BlockWarranty',
      'Ownership transferred on-chain',
      'Service recorded on blockchain · Repair',
      'Ownership transferred on-chain',
    ]);
    expect(timeline[0].date).toBe('2026-10-01T10:00:00.000Z');
    expect(timeline[2].txHash).toBe(`0x${'c'.repeat(64)}`);
  });
});

describe('public Product Passport warranty projection', () => {
  test('uses the Mongo purchase date and warranty duration instead of malformed chain timestamps', () => {
    const warranty = warrantyProjection({
      purchaseDate: new Date('2019-08-08T00:00:00.000Z'),
      warrantyPeriod: 3,
      warrantyUnit: 'Months',
    }, {
      status: 'expired',
      startDate: '1970-01-19T00:00:00.000Z',
      expiryDate: '1970-01-19T00:00:00.000Z',
      active: false,
      verified: true,
    }, Date.parse('2026-10-16T00:00:00.000Z'));

    expect(warranty.startDate).toBe('2019-08-08T00:00:00.000Z');
    expect(warranty.expiryDate).toBe('2019-11-06T00:00:00.000Z');
    expect(warranty.warrantyPeriod).toBe(3);
    expect(warranty.warrantyUnit).toBe('Months');
    expect(warranty.status).toBe('expired');
  });

  test('does not invent warranty dates when the Mongo purchase date or term is invalid', () => {
    const warranty = warrantyProjection({
      purchaseDate: 'not-a-date',
      warrantyPeriod: 'unknown',
      warrantyUnit: 'Months',
    }, {
      status: 'expired',
      startDate: '1970-01-19T00:00:00.000Z',
      expiryDate: '1970-01-19T00:00:00.000Z',
      active: false,
      verified: true,
    });

    expect(warranty.startDate).toBeNull();
    expect(warranty.expiryDate).toBeNull();
    expect(warranty.warrantyPeriod).toBeNull();
    expect(warranty.status).toBe('not-configured');
  });
});
