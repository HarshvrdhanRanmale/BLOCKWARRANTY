const mongoose = require('mongoose');

const supplierClaimTicketSchema = new mongoose.Schema(
  {
    ticketId: {
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
      default: 'Registered Customer',
      trim: true
    },
    productId: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    manufacturerSerialNumber: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    productName: {
      type: String,
      default: '',
      trim: true
    },
    claimType: {
      type: String,
      enum: ['repair', 'replacement'],
      default: 'repair'
    },
    issueCategory: {
      type: String,
      enum: ['component_malfunction', 'battery_degradation', 'screen_defect', 'physical_damage', 'liquid_damage', 'other'],
      default: 'component_malfunction'
    },
    issueDescription: {
      type: String,
      default: ''
    },
    claimDate: {
      type: Date,
      default: Date.now
    },
    diagnosticEvidence: {
      hasDiagnosticLog: { type: Boolean, default: false },
      diagnosticCode: { type: String, default: '' },
      diagnosticConfidence: { type: Number, default: 0 },
      hasPhotos: { type: Boolean, default: false },
      photoCount: { type: Number, default: 0 },
      isAccidentalDamageReported: { type: Boolean, default: false }
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
    // Replacement unit linkage if replacement policy applies
    replacementUnitSerial: {
      type: String,
      default: null
    },
    remainingWarrantyDaysTransferred: {
      type: Number,
      default: 0
    },
    // Preparation for smart contract recordWarrantyClaim
    onChainReady: {
      type: Boolean,
      default: false
    },
    onChainTxHash: {
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
    collection: 'supplier_claim_tickets'
  }
);

supplierClaimTicketSchema.index({ supplierWalletAddress: 1, validationState: 1 });
supplierClaimTicketSchema.index({ supplierWalletAddress: 1, manufacturerSerialNumber: 1 });

module.exports =
  mongoose.models.SupplierClaimTicket ||
  mongoose.model('SupplierClaimTicket', supplierClaimTicketSchema);
