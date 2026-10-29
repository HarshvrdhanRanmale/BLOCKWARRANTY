const mongoose = require('mongoose');

const supplierInvoiceSubmissionSchema = new mongoose.Schema(
  {
    submissionId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    supplierWalletAddress: {
      type: String,
      required: true,
      lowercase: true,
      index: true
    },
    brand: {
      type: String,
      default: '',
      trim: true
    },
    customerWallet: {
      type: String,
      lowercase: true,
      trim: true,
      default: ''
    },
    customerName: {
      type: String,
      default: 'Retail Customer',
      trim: true
    },
    fileName: {
      type: String,
      default: '',
      trim: true
    },
    fileHash: {
      type: String,
      default: '',
      index: true
    },
    invoiceNumber: {
      type: String,
      default: '',
      trim: true,
      index: true
    },
    extractedData: {
      serialNumber: { type: String, default: '', trim: true },
      productName: { type: String, default: '', trim: true },
      modelNumber: { type: String, default: '', trim: true },
      invoiceNumber: { type: String, default: '', trim: true },
      purchaseDate: { type: String, default: '' },
      sellerName: { type: String, default: '', trim: true },
      sellerGstin: { type: String, default: '', trim: true },
      invoiceIssuerType: {
        type: String,
        enum: ['supplier_direct', 'authorized_retailer', 'third_party_unknown'],
        default: 'authorized_retailer'
      },
      confidenceScore: { type: Number, default: 0, min: 0, max: 100 }
    },
    validationState: {
      type: String,
      enum: ['pending', 'auto_passed', 'auto_rejected', 'needs_review', 'manually_approved', 'manually_rejected'],
      default: 'pending',
      index: true
    },
    reasonCodes: [{
      code: { type: String, required: true },
      severity: { type: String, enum: ['info', 'warning', 'error'], default: 'info' },
      message: { type: String, required: true }
    }],
    decisionNotes: {
      type: String,
      default: ''
    },
    matchedInventoryUnit: {
      type: String,
      default: null
    },
    inventoryComparison: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    evaluatedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    collection: 'supplier_invoice_submissions'
  }
);

supplierInvoiceSubmissionSchema.index({ supplierWalletAddress: 1, validationState: 1 });
supplierInvoiceSubmissionSchema.index({ supplierWalletAddress: 1, fileHash: 1 });
supplierInvoiceSubmissionSchema.index({ supplierWalletAddress: 1, invoiceNumber: 1 });

module.exports =
  mongoose.models.SupplierInvoiceSubmission ||
  mongoose.model('SupplierInvoiceSubmission', supplierInvoiceSubmissionSchema);
