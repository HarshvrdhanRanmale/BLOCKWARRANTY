const mongoose = require('mongoose');
const productSchema = new mongoose.Schema({
  productId: { type: String, required: true, unique: true, trim: true, index: true },
  publicId: { type: String, unique: true, sparse: true, trim: true, index: true },
  walletAddress: { type: String, required: true, lowercase: true, trim: true, index: true },
  productName: { type: String, required: true, trim: true, maxlength: 200 },
  brand: { type: String, default: '', trim: true, maxlength: 120 },
  category: { type: String, default: 'Other', trim: true, maxlength: 80 },
  purchaseDate: { type: Date, default: null },
  warrantyPeriod: { type: Number, default: null, min: 0 },
  warrantyUnit: { type: String, enum: ['Days', 'Months', 'Years'], default: 'Years' },
  invoiceNumber: { type: String, default: '', trim: true, maxlength: 120 },
  currency: { type: String, default: '', trim: true, maxlength: 12 },
  unitPrice: { type: Number, default: null, min: 0 },
  quantity: { type: Number, default: null, min: 0 },
  lineItemAmount: { type: Number, default: null, min: 0 },
  subtotal: { type: Number, default: null, min: 0 },
  discount: { type: Number, default: null, min: 0 },
  shippingCost: { type: Number, default: null, min: 0 },
  tax: { type: Number, default: null, min: 0 },
  total: { type: Number, default: null, min: 0 },
  amountPaid: { type: Number, default: null, min: 0 },
  balanceDue: { type: Number, default: null, min: 0 },
  description: { type: String, default: '', maxlength: 5000 },
  productImage: { type: String, default: '' },
  productImageSourceUrl: { type: String, default: '' },
  invoiceFileId: { type: mongoose.Schema.Types.ObjectId, default: null },
  invoiceFileName: { type: String, default: '', trim: true, maxlength: 255 },
  invoiceMimeType: { type: String, default: '', trim: true, maxlength: 80 },
  invoiceExtractedData: { type: mongoose.Schema.Types.Mixed, default: {} },
  blockchainStatus: { type: String, enum: ['not_registered', 'pending', 'submitted', 'confirmed', 'failed'], default: 'not_registered' },
  blockchainTxHash: { type: String, default: '' },
  blockchainBlock: { type: Number, default: null },
  ownershipHistory: [{ from: { type: String, lowercase: true }, to: { type: String, lowercase: true }, transferredAt: Date, txHash: String }],
  status: { type: String, enum: ['Active', 'Expired', 'Transferred'], default: 'Active' }
}, { timestamps: true, collection: 'products' });

productSchema.index({ walletAddress: 1, createdAt: -1 });          // dashboard product list
productSchema.index({ walletAddress: 1, status: 1 });               // filter by status
productSchema.index({ blockchainStatus: 1 });                        // reconciliation queries

module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);

