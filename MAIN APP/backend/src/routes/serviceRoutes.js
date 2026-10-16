const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const ServiceRecord = require('../models/ServiceRecord');
const WarrantyClaim = require('../models/WarrantyClaim');
const { authenticate } = require('../middleware/auth');
const { contractAt, productKey, hashDocument, hashDetails, getProvider, verifyTransactionEvent, config, iface } = require('../services/blockchain');

const router = express.Router({ mergeParams: true });
const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
const DOCUMENT_TYPES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp',
  tif: 'image/tiff', tiff: 'image/tiff', avif: 'image/avif', heic: 'image/heic', heif: 'image/heif', svg: 'image/svg+xml',
  pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', md: 'text/markdown', rtf: 'application/rtf',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet', odp: 'application/vnd.oasis.opendocument.presentation'
};
const AI_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const SERVICE_FIELDS = ['invoiceNumber', 'serviceDate', 'serviceCenterName', 'serviceCenterContact', 'serviceType', 'issueReported', 'diagnosis', 'workPerformed', 'partsReplaced', 'laborCost', 'partsCost', 'totalCost', 'currency', 'warrantyCovered', 'customerCost'];
const CLAIM_FIELDS = ['claimDate', 'issue', 'claimDescription', 'serviceCenterName', 'diagnosis', 'resolution', 'claimStatus', 'partsReplaced', 'warrantyCovered', 'customerCost'];
const stringField = (value, limit = 2000) => String(value ?? '').trim().slice(0, limit);

function normalizeReviewedData(kind, input) {
  const allowed = kind === 'service' ? SERVICE_FIELDS : CLAIM_FIELDS;
  const data = {};
  for (const field of allowed) {
    if (!Object.hasOwn(input, field)) continue;
    const value = input[field];
    if (field === 'partsReplaced') {
      data.partsReplaced = (Array.isArray(value) ? value : []).slice(0, 50).filter((part) => part && stringField(part.name, 160)).map((part) => ({
        name: stringField(part.name, 160), partNumber: stringField(part.partNumber, 120),
        quantity: Number.isFinite(Number(part.quantity)) && Number(part.quantity) >= 0 ? Number(part.quantity) : 1,
        warrantyCovered: part.warrantyCovered === true || ['true', 'yes'].includes(String(part.warrantyCovered).toLowerCase()),
        cost: part.cost === '' || part.cost == null ? null : Number(part.cost)
      }));
    } else if (['laborCost', 'partsCost', 'totalCost', 'customerCost'].includes(field)) {
      if (value === '' || value == null) data[field] = null;
      else if (Number.isFinite(Number(value)) && Number(value) >= 0) data[field] = Number(value);
      else { const error = new Error(`${field} must be a non-negative amount.`); error.status = 400; throw error; }
    } else if (['serviceDate', 'claimDate'].includes(field)) {
      if (value === '' || value == null) data[field] = null;
      else { const date = new Date(value); if (Number.isNaN(date.getTime())) { const error = new Error(`${field} is not a valid date.`); error.status = 400; throw error; } data[field] = date; }
    } else if (field === 'warrantyCovered') {
      data[field] = value === true || ['true', 'yes'].includes(String(value).toLowerCase());
    } else {
      data[field] = stringField(value, field === 'workPerformed' || field === 'claimDescription' || field === 'resolution' ? 3000 : 2000);
    }
  }
  if (kind === 'service' && !['repair', 'maintenance', 'inspection', 'other'].includes(data.serviceType)) data.serviceType = 'other';
  if (kind === 'warranty_claim' && !['submitted', 'under_review', 'approved', 'rejected', 'in_service', 'resolved', 'cancelled'].includes(data.claimStatus)) data.claimStatus = 'submitted';
  return data;
}

router.use(authenticate);

async function findOwnedProduct(req) {
  if (mongoose.connection.readyState !== 1) return null;
  const pId = stringField(req.params.productId, 100);
  const caller = req.user.walletAddress.toLowerCase();
  const prod = await Product.findOne({ productId: pId }).lean();
  if (!prod) return null;
  if (prod.walletAddress.toLowerCase() === caller) return prod;

  // Verify on-chain owner
  try {
    const chainProduct = await contractAt().getProduct(productKey(prod.productId));
    if (chainProduct.currentOwner.toLowerCase() === caller) {
      await Product.updateOne({ _id: prod._id }, { $set: { walletAddress: caller } });
      prod.walletAddress = caller;
      return prod;
    }
  } catch {}
  return null;
}

function documentSignatureMatches(fileType, buffer) {
  const ascii = buffer.toString('ascii');
  if (fileType === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (fileType === 'image/png') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (fileType === 'image/webp') return buffer.length >= 12 && ascii.slice(0, 4) === 'RIFF' && ascii.slice(8, 12) === 'WEBP';
  if (fileType === 'image/gif') return ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a');
  if (fileType === 'image/bmp') return ascii.startsWith('BM');
  if (fileType === 'image/tiff') return buffer.length >= 4 && (buffer.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])) || buffer.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a])));
  if (['image/avif', 'image/heic', 'image/heif'].includes(fileType)) return ascii.slice(4, 8) === 'ftyp' && /avif|avis|heic|heix|hevc|hevx|mif1|msf1/.test(ascii.slice(8, 16));
  if (fileType === 'image/svg+xml') return /^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(buffer.toString('utf8', 0, Math.min(buffer.length, 1024)));
  if (fileType === 'application/pdf') return ascii.startsWith('%PDF-');
  if (['application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint'].includes(fileType)) return buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if (['application/rtf', 'text/rtf'].includes(fileType)) return /^\s*\{\\rtf/i.test(buffer.toString('utf8', 0, Math.min(buffer.length, 32)));
  if (fileType.startsWith('application/vnd.openxmlformats-officedocument.') || fileType.startsWith('application/vnd.oasis.opendocument.')) return ascii.startsWith('PK\u0003\u0004');
  if (['text/plain', 'text/csv', 'text/markdown'].includes(fileType)) {
    if (buffer.includes(0)) return false;
    const text = buffer.toString('utf8');
    return !text.includes('\ufffd');
  }
  return false;
}

function readDocument(req) {
  const { fileData, fileType } = req.body || {};
  const fileName = stringField(req.body?.fileName, 255) || 'service-document';
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  const candidateType = !fileType || fileType === 'application/octet-stream' ? DOCUMENT_TYPES[extension] : fileType;
  const normalizedType = typeof candidateType === 'string' && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(candidateType) ? candidateType.slice(0, 100) : 'application/octet-stream';
  if (typeof fileData !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(fileData)) {
    const error = new Error('The selected file could not be read. Please choose it again.'); error.status = 400; throw error;
  }
  const buffer = Buffer.from(fileData, 'base64');
  if (!buffer.length || buffer.length > MAX_DOCUMENT_BYTES) { const error = new Error('Service document must be 15 MB or smaller.'); error.status = buffer.length ? 413 : 400; throw error; }
  if (Object.values(DOCUMENT_TYPES).includes(normalizedType) && !documentSignatureMatches(normalizedType, buffer)) { const error = new Error('The file contents do not match the selected document type.'); error.status = 400; throw error; }
  return { buffer, fileType: normalizedType, fileName };
}

router.post('/extract', async (req, res) => {
  try {
    const product = await findOwnedProduct(req);
    if (!product) return res.status(mongoose.connection.readyState === 1 ? 404 : 503).json({ message: 'Product unavailable or database disconnected.' });
    const { buffer, fileType } = readDocument(req);
    if (!AI_IMAGE_TYPES.has(fileType)) return res.status(415).json({ message: 'This file format is supported as a private attachment. Automatic extraction currently accepts JPG, PNG, or WEBP images; enter the details manually and save the original document.' });
    if (!process.env.GROQ_API_KEY) return res.status(503).json({ message: 'Document extraction is not configured. Set GROQ_API_KEY in backend/.env.' });
    const fields = ['invoiceNumber', 'serviceDate', 'serviceCenterName', 'serviceCenterContact', 'serviceType', 'issueReported', 'diagnosis', 'workPerformed', 'partsReplaced', 'laborCost', 'partsCost', 'totalCost', 'currency', 'warrantyCovered', 'customerCost', 'claimDate', 'claimDescription', 'resolution'];
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(45000),
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.GROQ_MODEL || 'qwen/qwen3.8-27b', temperature: 0, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: [
        { type: 'text', text: `Extract service/repair or warranty-claim data from this document. Return a JSON object with exactly these fields: ${fields.join(', ')}. Use empty strings for unsupported values; never guess. Dates must be YYYY-MM-DD, costs numeric strings, warrantyCovered a boolean or empty string, partsReplaced an array of objects with name, partNumber, quantity, warrantyCovered, cost.` },
        { type: 'image_url', image_url: { url: `data:${fileType};base64,${buffer.toString('base64')}` } }
      ] }] })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(502).json({ message: result.error?.message || `Groq document extraction failed (${response.status}). Review the bill manually.` });
    const content = result.choices?.[0]?.message?.content;
    const extractedData = typeof content === 'string' ? JSON.parse(content) : null;
    if (!extractedData || typeof extractedData !== 'object' || Array.isArray(extractedData)) return res.status(502).json({ message: 'Groq returned no usable fields. Enter the service details manually.' });
    return res.json({ message: 'Extraction is a draft only. Review and correct every field before saving.', extractedData });
  } catch (error) {
    const status = error.status || (error.name === 'TimeoutError' ? 504 : 502);
    console.error('Service document extraction failed:', error.message);
    return res.status(status).json({ message: error.message || 'Could not extract the service document.' });
  }
});

router.post('/drafts', async (req, res) => {
  let uploaded;
  try {
    const product = await findOwnedProduct(req);
    if (!product) return res.status(mongoose.connection.readyState === 1 ? 404 : 503).json({ message: 'Product unavailable or database disconnected.' });
    const { buffer, fileType, fileName } = readDocument(req);
    const kind = req.body?.kind === 'warranty_claim' ? 'warranty_claim' : 'service';
    const confirmedData = req.body?.confirmedData;
    if (!confirmedData || typeof confirmedData !== 'object' || Array.isArray(confirmedData)) return res.status(400).json({ message: 'Review and provide the service details before saving a draft.' });
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'serviceDocuments' });
    const ownerWallet = req.user.walletAddress.toLowerCase();
    const serviceId = `BWS-${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
    const documentHash = crypto.createHash('sha256').update(buffer).digest('hex');
    const stream = bucket.openUploadStream(fileName, { contentType: fileType, metadata: { ownerWallet, productId: product.productId, serviceId, kind, documentHash } });
    uploaded = await new Promise((resolve, reject) => { stream.once('error', reject); stream.once('finish', () => resolve(stream.id)); stream.end(buffer); });
    const data = normalizeReviewedData(kind, confirmedData);
    const record = kind === 'service'
      ? await ServiceRecord.create({ ...data, serviceId, productId: product.productId, ownerWallet, documentId: uploaded, documentName: fileName, documentMimeType: fileType, documentSize: buffer.length, documentHash, extractedData: req.body.extractedData || {}, confirmedData: data, status: 'draft', blockchainStatus: 'not_recorded' })
      : await WarrantyClaim.create({ ...data, warrantyClaimId: serviceId, productId: product.productId, ownerWallet, documentId: uploaded, documentName: fileName, documentMimeType: fileType, documentSize: buffer.length, documentHash, extractedData: req.body.extractedData || {}, confirmedData: data, status: 'draft', blockchainStatus: 'not_recorded' });
    return res.status(201).json({ message: 'Reviewed draft saved privately. It has not been recorded on-chain.', kind, draft: record });
  } catch (error) {
    if (uploaded && mongoose.connection.readyState === 1) {
      try { await new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'serviceDocuments' }).delete(uploaded); } catch (cleanupError) { console.error('Service document cleanup failed:', cleanupError.message); }
    }
    console.error('Service draft save failed:', error.message);
    return res.status(error.status || 500).json({ message: error.status ? error.message : 'The reviewed service draft could not be saved.' });
  }
});

router.get('/', async (req, res) => {
  try {
    const product = await findOwnedProduct(req);
    if (!product) return res.status(mongoose.connection.readyState === 1 ? 404 : 503).json({ message: 'Product unavailable or database disconnected.' });
    const [services, claims] = await Promise.all([
      ServiceRecord.find({ productId: product.productId, ownerWallet: req.user.walletAddress.toLowerCase() }).sort({ createdAt: -1 }).lean(),
      WarrantyClaim.find({ productId: product.productId, ownerWallet: req.user.walletAddress.toLowerCase() }).sort({ createdAt: -1 }).lean()
    ]);
    return res.json({ services, warrantyClaims: claims });
  } catch (error) { console.error('Service history lookup failed:', error.message); return res.status(500).json({ message: 'Service history could not be loaded.' }); }
});

router.post('/prepare', async (req, res) => {
  try {
    const product = await findOwnedProduct(req);
    if (!product) return res.status(404).json({ message: 'Product not found for this account.' });
    const kind = req.body?.kind === 'warranty_claim' ? 'warranty_claim' : 'service';
    const record = kind === 'service'
      ? await ServiceRecord.findOne({ serviceId: req.body?.recordId, productId: product.productId, ownerWallet: req.user.walletAddress.toLowerCase() })
      : await WarrantyClaim.findOne({ warrantyClaimId: req.body?.recordId, productId: product.productId, ownerWallet: req.user.walletAddress.toLowerCase() });
    if (!record || !['draft', 'pending_blockchain'].includes(record.status)) return res.status(404).json({ message: 'Reviewed draft not found.' });

    const contract = contractAt(getProvider());
    const pKey = productKey(product.productId);
    const chainProduct = await contract.getProduct(pKey);
    if (chainProduct.currentOwner.toLowerCase() !== req.user.walletAddress.toLowerCase()) {
      return res.status(409).json({ message: 'You must be the on-chain owner of this product to record service/claims.' });
    }

    const id = kind === 'service' ? record.serviceId : record.warrantyClaimId;
    const descHash = hashDocument(record.documentHash) || hashDetails(record.confirmedData);
    const method = kind === 'service' ? 'recordService' : 'recordWarrantyClaim';
    const approved = kind === 'warranty_claim' ? Boolean(record.confirmedData?.claimStatus === 'approved') : false;
    const args = kind === 'service' ? [pKey, descHash] : [pKey, descHash, approved];

    try {
      await contract[method].staticCall(...args, { from: req.user.walletAddress });
    } catch (simulationError) {
      const reason = simulationError.reason || simulationError.shortMessage || 'The current wallet cannot record this entry for the selected product.';
      return res.status(409).json({ message: `Blockchain pre-check failed: ${reason}` });
    }

    record.status = 'pending_blockchain';
    record.blockchainStatus = 'pending';
    await record.save();

    return res.json({
      chainId: config.BLOCKCHAIN_CHAIN_ID,
      to: contract.target,
      data: iface.encodeFunctionData(method, args),
      recordId: id,
      kind,
      descriptionHash: descHash,
      productKey: pKey,
      method,
      args
    });
  } catch (error) { return res.status(error.status || 503).json({ message: error.message || 'Could not prepare blockchain transaction.' }); }
});

router.post('/confirm', async (req, res) => {
  try {
    const product = await findOwnedProduct(req);
    if (!product) return res.status(404).json({ message: 'Product not found for this account.' });
    const kind = req.body?.kind === 'warranty_claim' ? 'warranty_claim' : 'service';
    const record = kind === 'service'
      ? await ServiceRecord.findOne({ serviceId: req.body?.recordId, productId: product.productId, ownerWallet: req.user.walletAddress.toLowerCase() })
      : await WarrantyClaim.findOne({ warrantyClaimId: req.body?.recordId, productId: product.productId, ownerWallet: req.user.walletAddress.toLowerCase() });
    if (!record) return res.status(404).json({ message: 'Reviewed draft not found.' });

    const eventName = kind === 'service' ? 'ServiceRecorded' : 'WarrantyClaimRecorded';
    const pKey = productKey(product.productId);

    const verified = await verifyTransactionEvent({
      txHash: req.body?.txHash,
      eventName,
      expectedProductKey: pKey,
    });

    record.status = 'confirmed';
    record.blockchainStatus = 'confirmed';
    record.txHash = verified.receipt.hash;
    record.blockNumber = verified.receipt.blockNumber;
    record.blockchainTimestamp = new Date(Number(verified.block?.timestamp || Date.now() / 1000) * 1000);
    await record.save();

    return res.json({
      success: true,
      message: `${kind === 'service' ? 'Service' : 'Warranty claim'} record verified on Sepolia smart contract.`,
      transactionHash: verified.receipt.hash,
      blockNumber: verified.receipt.blockNumber,
    });
  } catch (error) { return res.status(error.status || 400).json({ message: error.message || 'Could not verify service transaction.' }); }
});

router.get('/:recordId/document', async (req, res) => {
  try {
    const ownerWallet = req.user.walletAddress.toLowerCase();
    const record = await ServiceRecord.findOne({ serviceId: stringField(req.params.recordId, 100), ownerWallet }).lean()
      || await WarrantyClaim.findOne({ warrantyClaimId: stringField(req.params.recordId, 100), ownerWallet }).lean();
    if (!record?.documentId || record.productId !== stringField(req.params.productId, 100)) return res.status(404).json({ message: 'Private service document not found.' });
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'serviceDocuments' });
    const files = await bucket.find({ _id: record.documentId, 'metadata.ownerWallet': ownerWallet, 'metadata.productId': record.productId }).toArray();
    if (!files.length) return res.status(404).json({ message: 'Private service document not found.' });
    res.set('Content-Type', record.documentMimeType || 'application/octet-stream');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(record.documentName || files[0].filename)}"`);
    return bucket.openDownloadStream(record.documentId).pipe(res);
  } catch (error) { console.error('Service document download failed:', error.message); return res.status(500).json({ message: 'The service document could not be downloaded.' }); }
});

module.exports = router;
