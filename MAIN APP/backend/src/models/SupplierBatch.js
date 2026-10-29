const mongoose = require('mongoose');

const supplierBatchSchema = new mongoose.Schema(
  {
    batchId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    batchKey: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    supplierWalletAddress: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true
    },
    supplierCompanyName: {
      type: String,
      default: '',
      trim: true
    },
    brand: {
      type: String,
      default: '',
      trim: true
    },
    unitCount: {
      type: Number,
      required: true,
      min: 1
    },
    merkleRoot: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    blockchainStatus: {
      type: String,
      enum: ['pending', 'anchored', 'failed'],
      default: 'pending',
      index: true
    },
    blockchainTxHash: {
      type: String,
      default: null,
      trim: true
    },
    blockchainBlock: {
      type: Number,
      default: null
    },
    anchoredAt: {
      type: Date,
      default: null
    },
    purchaseOrderNumber: {
      type: String,
      default: '',
      trim: true
    },
    shipmentReference: {
      type: String,
      default: '',
      trim: true
    }
  },
  {
    timestamps: true,
    collection: 'supplier_batches'
  }
);

supplierBatchSchema.index({ supplierWalletAddress: 1, createdAt: -1 });

module.exports =
  mongoose.models.SupplierBatch ||
  mongoose.model('SupplierBatch', supplierBatchSchema);
