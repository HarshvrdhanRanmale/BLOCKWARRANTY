const mongoose = require('mongoose');

const warrantyClaimSchema = new mongoose.Schema({
  warrantyClaimId: { type: String, required: true, unique: true, index: true },
  productId: { type: String, required: true, index: true },
  ownerWallet: { type: String, required: true, lowercase: true, index: true },
  claimDate: { type: Date, default: null },
  issue: { type: String, default: '', maxlength: 2000 },
  claimDescription: { type: String, default: '', maxlength: 3000 },
  claimStatus: { type: String, enum: ['submitted', 'under_review', 'approved', 'rejected', 'in_service', 'resolved', 'cancelled'], default: 'submitted' },
  serviceCenterName: { type: String, default: '', maxlength: 200 },
  diagnosis: { type: String, default: '', maxlength: 2000 },
  resolution: { type: String, default: '', maxlength: 3000 },
  partsReplaced: [{ name: { type: String, required: true, maxlength: 160 }, partNumber: { type: String, default: '', maxlength: 120 }, quantity: { type: Number, default: 1, min: 0 }, warrantyCovered: { type: Boolean, default: false }, cost: { type: Number, default: null, min: 0 } }],
  warrantyCovered: { type: Boolean, default: false },
  customerCost: { type: Number, default: null, min: 0 },
  serviceRecordId: { type: String, default: null },
  documentId: { type: mongoose.Schema.Types.ObjectId, default: null },
  documentName: { type: String, default: '', maxlength: 255 },
  documentMimeType: { type: String, default: '', maxlength: 80 },
  documentSize: { type: Number, default: 0, min: 0 },
  documentHash: { type: String, default: '', match: /^[a-f\d]{64}$/i },
  extractedData: { type: mongoose.Schema.Types.Mixed, default: {} },
  confirmedData: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ['draft', 'pending_blockchain', 'confirmed', 'failed'], default: 'draft' },
  blockchainStatus: { type: String, enum: ['not_recorded', 'pending', 'confirmed', 'failed'], default: 'not_recorded' },
  txHash: { type: String, default: '' },
  blockNumber: { type: Number, default: null },
  logIndex: { type: Number, default: null },
  blockchainTimestamp: { type: Date, default: null }
}, { timestamps: true, collection: 'warrantyclaims' });

warrantyClaimSchema.index({ productId: 1, ownerWallet: 1, createdAt: -1 });
warrantyClaimSchema.index({ txHash: 1, logIndex: 1 }, { sparse: true });

module.exports = mongoose.models.WarrantyClaim || mongoose.model('WarrantyClaim', warrantyClaimSchema);
