const mongoose = require('mongoose');

const supplierInventorySchema = new mongoose.Schema(
  {
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
    productId: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    warrantyId: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    productName: {
      type: String,
      required: true,
      trim: true
    },
    brand: {
      type: String,
      default: '',
      trim: true
    },
    modelNumber: {
      type: String,
      required: true,
      trim: true
    },
    variant: {
      type: String,
      default: '',
      trim: true
    },
    manufacturerSerialNumber: {
      type: String,
      required: true,
      trim: true
    },
    warrantyDurationMonths: {
      type: Number,
      required: true,
      min: 1
    },
    warrantyStartRule: {
      type: String,
      enum: ['purchase_date', 'activation_date'],
      required: true
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
    },
    receivedDate: {
      type: Date,
      default: null
    },
    purchaseDate: {
      type: Date,
      default: null
    },
    status: {
      type: String,
      enum: ['unclaimed', 'registered', 'voided'],
      default: 'unclaimed',
      index: true
    },
    registeredByCustomer: {
      type: String,
      lowercase: true,
      trim: true,
      default: null
    },
    registeredAt: {
      type: Date,
      default: null
    },
    customerProductId: {
      type: String,
      default: null
    },
    activatedWarrantyExpiry: {
      type: Date,
      default: null
    },
    importBatchId: {
      type: String,
      required: true,
      index: true
    },
    importRowNumber: {
      type: Number,
      default: 0
    },
    merkleLeaf: {
      type: String,
      default: null,
      trim: true
    },
    merkleProof: [{
      type: String,
      trim: true
    }],
    blockchainTxHash: {
      type: String,
      default: null,
      trim: true
    },
    blockchainAnchored: {
      type: Boolean,
      default: false,
      index: true
    },
    // Atomic reservation lock with TTL for race-condition prevention
    lockedBySubmissionId: {
      type: String,
      default: null,
      index: true
    },
    lockExpiresAt: {
      type: Date,
      default: null,
      index: true
    }
  },
  {
    timestamps: true,
    collection: 'supplier_inventories'
  }
);

// Compound unique index: A supplier cannot upload the same serial number more than once
supplierInventorySchema.index(
  { supplierWalletAddress: 1, manufacturerSerialNumber: 1 },
  { unique: true }
);

supplierInventorySchema.index({ supplierWalletAddress: 1, status: 1 });
supplierInventorySchema.index({ supplierWalletAddress: 1, productId: 1 });
supplierInventorySchema.index({ supplierWalletAddress: 1, warrantyId: 1 });

module.exports =
  mongoose.models.SupplierInventory ||
  mongoose.model('SupplierInventory', supplierInventorySchema);
