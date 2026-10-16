const crypto = require('crypto');
const config = require('../config/env');

/**
 * Razorpay Test Mode integration service (server-side only).
 *
 * Design rules enforced here:
 *  - The RAZORPAY_KEY_SECRET is only ever used inside this backend module. It
 *    is never returned to, logged for, or reachable by the frontend.
 *  - Payment authority is ALWAYS established by re-fetching the order/payment
 *    from Razorpay's API and checking its captured status. The frontend is
 *    never trusted to declare that a payment succeeded.
 *  - The checkout signature is verified with an HMAC-SHA256 of
 *    `${orderId}|${paymentId}` keyed by the secret, using a timing-safe
 *    comparison.
 */

let client = null;

function isConfigured() {
  return Boolean(config.RAZORPAY_KEY_ID && config.RAZORPAY_KEY_SECRET);
}

/**
 * Lazily construct the Razorpay client so importing this module never throws
 * when Razorpay is not configured (keeps unit tests and offline runs happy).
 */
function getClient() {
  if (!isConfigured()) {
    throw Object.assign(
      new Error('Razorpay Test Mode is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in backend/.env and restart the backend.'),
      { status: 503 }
    );
  }
  if (!client) {
    // Require lazily so the module can load even before keys exist.
    const Razorpay = require('razorpay');
    client = new Razorpay({
      key_id: config.RAZORPAY_KEY_ID,
      key_secret: config.RAZORPAY_KEY_SECRET,
    });
  }
  return client;
}

/**
 * Create a Razorpay order for a transfer sale.
 * @param {object} params
 * @param {number} params.amountMinor  Amount in the smallest currency unit (e.g. paise for INR).
 * @param {string} params.currency     Three-letter ISO currency code (e.g. 'INR').
 * @param {string} params.receipt      Receipt id — used to correlate the order.
 * @param {object} [params.notes]      Extra metadata stored on the Razorpay order.
 */
async function createOrder({ amountMinor, currency, receipt, notes }) {
  const amount = Number(amountMinor);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw Object.assign(new Error('A valid positive amount (in the smallest currency unit) is required.'), { status: 400 });
  }
  if (!/^[A-Z]{3}$/.test(String(currency || ''))) {
    throw Object.assign(new Error('A valid three-letter currency code is required.'), { status: 400 });
  }
  const instance = getClient();
  const order = await instance.orders.create({
    amount,
    currency: String(currency).toUpperCase(),
    receipt: String(receipt || '').slice(0, 40) || undefined,
    notes: notes && typeof notes === 'object' ? notes : undefined,
    // Test Mode: auto-capture so a successful UPI payment is immediately settled.
    payment_capture: 1,
  });
  return order;
}

/** Fetch an order by id from Razorpay (authoritative server-side read). */
async function fetchOrder(orderId) {
  if (!orderId) {
    throw Object.assign(new Error('A Razorpay order id is required.'), { status: 400 });
  }
  return getClient().orders.fetch(orderId);
}

/** Fetch a payment by id from Razorpay (authoritative server-side read). */
async function fetchPayment(paymentId) {
  if (!paymentId) {
    throw Object.assign(new Error('A Razorpay payment id is required.'), { status: 400 });
  }
  return getClient().payments.fetch(paymentId);
}

/** Timing-safe string comparison that tolerates unequal lengths. */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verify the Razorpay checkout signature returned by the client widget.
 * The expected signature is HMAC_SHA256(`${orderId}|${paymentId}`, key_secret).
 * @returns {boolean} true only when the signature is authentic.
 */
function verifyCheckoutSignature({ orderId, paymentId, signature }) {
  if (!orderId || !paymentId || !signature || !isConfigured()) return false;
  const expected = crypto
    .createHmac('sha256', config.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return safeEqual(expected, signature);
}

module.exports = {
  isConfigured,
  createOrder,
  fetchOrder,
  fetchPayment,
  verifyCheckoutSignature,
};
