const mongoose = require('mongoose');

const transferSchema = new mongoose.Schema({
  productId: { type: String, required: true, trim: true },
  sellerWallet: { type: String, required: true, lowercase: true, trim: true, index: true },
  buyerWallet: { type: String, required: true, lowercase: true, trim: true, index: true },
  price: { type: Number, required: true, min: 0.000001 },
  currency: { type: String, required: true, uppercase: true, trim: true, maxlength: 3 },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'cancelled', 'completed'],
    default: 'pending',
    index: true,
  },
  acceptedAt: { type: Date, default: null },
  rejectedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  transactionHash: { type: String, default: '' },
  // Razorpay Test Mode payment (additive; defaults preserve old documents).
  // paymentStatus gates ownership transfer: none | created | paid | failed.
  paymentStatus: {
    type: String,
    enum: ['none', 'created', 'paid', 'failed'],
    default: 'none',
    index: true,
  },
  ownershipTransferStatus: {
    type: String,
    enum: ['not_started', 'pending', 'confirmed', 'failed'],
    default: 'not_started',
    index: true,
  },
  ownershipTransferError: { type: String, default: '', maxlength: 500 },
  paymentCurrency: { type: String, default: '', trim: true, uppercase: true, maxlength: 3 },
  paymentAmountMinor: { type: Number, default: null, min: 0 },
  razorpayOrderId: { type: String, default: '', index: true, sparse: true },
  razorpayPaymentId: { type: String, default: '' },
  paymentVerifiedAt: { type: Date, default: null },
}, { timestamps: true, collection: 'transfers' });

transferSchema.index(
  { productId: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);
transferSchema.index({ sellerWallet: 1, createdAt: -1 });
transferSchema.index({ buyerWallet: 1, createdAt: -1 });

module.exports = mongoose.models.Transfer || mongoose.model('Transfer', transferSchema);
