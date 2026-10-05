const mongoose = require('mongoose');

const partSchema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 160 },
  partNumber: { type: String, default: '', maxlength: 120 },
  quantity: { type: Number, default: 1, min: 0 },
  warrantyCovered: { type: Boolean, default: false },
  cost: { type: Number, default: null, min: 0 }
}, { _id: false });

const serviceRecordSchema = new mongoose.Schema({
  serviceId: { type: String, required: true, unique: true, index: true },
  productId: { type: String, required: true, index: true },
  ownerWallet: { type: String, required: true, lowercase: true, index: true },
  serviceDate: { type: Date, default: null },
  serviceCenterName: { type: String, default: '', maxlength: 200 },
  serviceCenterContact: { type: String, default: '', maxlength: 120 },
  serviceType: { type: String, default: 'repair', enum: ['repair', 'maintenance', 'inspection', 'other'] },
  issueReported: { type: String, default: '', maxlength: 2000 },
  diagnosis: { type: String, default: '', maxlength: 2000 },
  workPerformed: { type: String, default: '', maxlength: 3000 },
  partsReplaced: { type: [partSchema], default: [] },
  laborCost: { type: Number, default: null, min: 0 },
  partsCost: { type: Number, default: null, min: 0 },
  totalCost: { type: Number, default: null, min: 0 },
  currency: { type: String, default: '', maxlength: 12 },
  warrantyClaimId: { type: String, default: null },
  warrantyCovered: { type: Boolean, default: false },
  customerCost: { type: Number, default: null, min: 0 },
  invoiceNumber: { type: String, default: '', maxlength: 120 },
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
}, { timestamps: true, collection: 'servicerecords' });

serviceRecordSchema.index({ productId: 1, ownerWallet: 1, createdAt: -1 });
serviceRecordSchema.index({ txHash: 1, logIndex: 1 }, { sparse: true });

module.exports = mongoose.models.ServiceRecord || mongoose.model('ServiceRecord', serviceRecordSchema);
