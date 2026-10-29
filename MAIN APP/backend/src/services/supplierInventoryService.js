const { ethers } = require('ethers');
const crypto = require('crypto');
const SupplierInventory = require('../models/SupplierInventory');
const SupplierBatch = require('../models/SupplierBatch');
const User = require('../models/User');
const { MerkleTree, computeUnitLeaf } = require('../utils/merkleTree');

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

class SupplierInventoryService {
  /**
   * Validate a batch of inventory rows before any insertion.
   * Performs schema checks, intra-file duplicate detection, and database uniqueness checks.
   */
  async validateCsvRows(supplierWalletAddress, rawRows, supplierProfile = {}) {
    if (!Array.isArray(rawRows) || rawRows.length === 0) {
      throw Object.assign(new Error('The uploaded CSV does not contain any data rows.'), { status: 400 });
    }

    const normalizedAddress = supplierWalletAddress.toLowerCase();
    const validatedRows = [];
    const errors = [];

    // Track internal duplicates within the uploaded file
    const seenSerials = new Map(); // serial.toLowerCase() -> rowNumber
    const seenWarrantyIds = new Map(); // warrantyId.toLowerCase() -> rowNumber

    // Collect lists to query against database
    const serialsToCheck = [];
    const warrantyIdsToCheck = [];

    rawRows.forEach((row, idx) => {
      const rowNumber = idx + 1;
      const serial = String(row.manufacturerSerialNumber || '').trim();
      const wId = String(row.warrantyId || '').trim();

      if (serial) serialsToCheck.push(serial);
      if (wId) warrantyIdsToCheck.push(wId);
    });

    // Check existing database records for this supplier
    const [existingSerials, existingWarrantyIds] = await Promise.all([
      SupplierInventory.find({
        supplierWalletAddress: normalizedAddress,
        manufacturerSerialNumber: { $in: serialsToCheck }
      }).select('manufacturerSerialNumber status').lean(),
      SupplierInventory.find({
        supplierWalletAddress: normalizedAddress,
        warrantyId: { $in: warrantyIdsToCheck }
      }).select('warrantyId').lean()
    ]);

    const existingSerialSet = new Set(
      existingSerials.map((doc) => doc.manufacturerSerialNumber.toLowerCase())
    );
    const existingWarrantyIdSet = new Set(
      existingWarrantyIds.map((doc) => doc.warrantyId.toLowerCase())
    );

    // Validate each row
    rawRows.forEach((row, idx) => {
      const rowNumber = idx + 1;
      const rowErrors = [];

      const productId = String(row.productId || '').trim();
      const warrantyId = String(row.warrantyId || '').trim();
      const productName = String(row.productName || '').trim();
      const modelNumber = String(row.modelNumber || '').trim();
      const manufacturerSerialNumber = String(row.manufacturerSerialNumber || '').trim();
      const durationRaw = row.warrantyDurationMonths;
      const warrantyStartRule = String(row.warrantyStartRule || '').trim().toLowerCase();

      const brand = String(row.brand || supplierProfile.brandName || '').trim();
      const variant = String(row.variant || '').trim();
      const purchaseOrderNumber = String(row.purchaseOrderNumber || '').trim();
      const shipmentReference = String(row.shipmentReference || '').trim();
      const receivedDateStr = String(row.receivedDate || '').trim();
      const purchaseDateStr = String(row.purchaseDate || '').trim();

      // 1. Required fields checks
      if (!productId) rowErrors.push('productId is required.');
      if (!warrantyId) rowErrors.push('warrantyId is required.');
      if (!productName) rowErrors.push('productName is required.');
      if (!modelNumber) rowErrors.push('modelNumber is required.');
      if (!manufacturerSerialNumber) rowErrors.push('manufacturerSerialNumber is required.');

      // 2. Warranty duration check
      const durationNum = Number(durationRaw);
      if (!Number.isInteger(durationNum) || durationNum <= 0) {
        rowErrors.push('warrantyDurationMonths must be a positive whole number (e.g. 12, 24).');
      }

      // 3. Warranty start rule check
      if (!['purchase_date', 'activation_date'].includes(warrantyStartRule)) {
        rowErrors.push("warrantyStartRule must be strictly 'purchase_date' or 'activation_date'.");
      }

      // 4. Date format checks (YYYY-MM-DD)
      let parsedReceivedDate = null;
      if (receivedDateStr) {
        if (!DATE_REGEX.test(receivedDateStr) || Number.isNaN(Date.parse(receivedDateStr))) {
          rowErrors.push("receivedDate must be in strict YYYY-MM-DD format (e.g. 2026-03-15).");
        } else {
          parsedReceivedDate = new Date(receivedDateStr);
        }
      }

      let parsedPurchaseDate = null;
      if (purchaseDateStr) {
        if (!DATE_REGEX.test(purchaseDateStr) || Number.isNaN(Date.parse(purchaseDateStr))) {
          rowErrors.push("purchaseDate must be in strict YYYY-MM-DD format (e.g. 2026-03-15).");
        } else {
          parsedPurchaseDate = new Date(purchaseDateStr);
        }
      }

      // 5. Intra-file duplicate check for Serial Number
      if (manufacturerSerialNumber) {
        const serialKey = manufacturerSerialNumber.toLowerCase();
        if (seenSerials.has(serialKey)) {
          rowErrors.push(
            `Duplicate serial number within file: '${manufacturerSerialNumber}' already appeared on row ${seenSerials.get(serialKey)}.`
          );
        } else {
          seenSerials.set(serialKey, rowNumber);
        }

        // 6. Database duplicate check
        if (existingSerialSet.has(serialKey)) {
          rowErrors.push(
            `Serial number '${manufacturerSerialNumber}' is already registered in your existing inventory.`
          );
        }
      }

      // 7. Intra-file & Database duplicate check for Warranty ID
      if (warrantyId) {
        const wKey = warrantyId.toLowerCase();
        if (seenWarrantyIds.has(wKey)) {
          rowErrors.push(
            `Duplicate warrantyId within file: '${warrantyId}' already appeared on row ${seenWarrantyIds.get(wKey)}.`
          );
        } else {
          seenWarrantyIds.set(wKey, rowNumber);
        }

        if (existingWarrantyIdSet.has(wKey)) {
          rowErrors.push(
            `Warranty ID '${warrantyId}' is already registered in your existing inventory.`
          );
        }
      }

      const isValid = rowErrors.length === 0;

      if (!isValid) {
        errors.push({
          rowNumber,
          serial: manufacturerSerialNumber || 'N/A',
          reasons: rowErrors
        });
      }

      validatedRows.push({
        rowNumber,
        isValid,
        errors: rowErrors,
        data: {
          productId,
          warrantyId,
          productName,
          modelNumber,
          brand,
          variant,
          manufacturerSerialNumber,
          warrantyDurationMonths: durationNum,
          warrantyStartRule,
          purchaseOrderNumber,
          shipmentReference,
          receivedDate: parsedReceivedDate,
          purchaseDate: parsedPurchaseDate
        }
      });
    });

    const isAllValid = errors.length === 0;

    let importBatchId = null;
    let batchKey = null;
    let merkleRoot = null;

    if (isAllValid && rawRows.length > 0) {
      importBatchId = `BATCH-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto
        .randomBytes(4)
        .toString('hex')
        .toUpperCase()}`;

      const leaves = validatedRows.map((row) =>
        computeUnitLeaf({
          productId: row.data.productId,
          warrantyId: row.data.warrantyId,
          manufacturerSerialNumber: row.data.manufacturerSerialNumber,
          warrantyDurationMonths: row.data.warrantyDurationMonths
        })
      );

      const tree = new MerkleTree(leaves);
      merkleRoot = tree.getRoot();
      batchKey = ethers.keccak256(ethers.toUtf8Bytes(`BATCH:${importBatchId}`));
    }

    return {
      isValid: isAllValid,
      totalRows: rawRows.length,
      validCount: validatedRows.filter((r) => r.isValid).length,
      errorCount: errors.length,
      rows: validatedRows,
      errors,
      importBatchId,
      batchKey,
      merkleRoot
    };
  }

  /**
   * Commit a valid batch of rows to the database atomically ONLY AFTER on-chain registration.
   */
  async commitBatchImport(supplierWalletAddress, rawRows, metadata = {}, blockchainData = {}) {
    const { txHash, blockNumber } = blockchainData;

    if (!txHash) {
      const err = new Error(
        'On-chain transaction hash is required. Batch must be successfully registered on the blockchain before saving to the database.'
      );
      err.status = 400;
      throw err;
    }

    const normalizedAddress = supplierWalletAddress.toLowerCase();

    // Fetch supplier info for audit
    const supplierUser = await User.findOne({ walletAddress: normalizedAddress });
    const supplierProfile = supplierUser?.supplierProfile || {};

    // Validate first (No partial saves!)
    const validationResult = await this.validateCsvRows(normalizedAddress, rawRows, supplierProfile);

    if (!validationResult.isValid) {
      const err = new Error(
        `Batch import rejected: ${validationResult.errorCount} row(s) contain validation errors. Please correct them and retry.`
      );
      err.status = 400;
      err.details = validationResult.errors;
      throw err;
    }

    const importBatchId = blockchainData.importBatchId || validationResult.importBatchId;

    // 1. Compute deterministic cryptographic leaf for each physical unit
    const leaves = validationResult.rows.map((row) =>
      computeUnitLeaf({
        productId: row.data.productId,
        warrantyId: row.data.warrantyId,
        manufacturerSerialNumber: row.data.manufacturerSerialNumber,
        warrantyDurationMonths: row.data.warrantyDurationMonths
      })
    );

    // 2. Build Cryptographic Merkle Tree
    const tree = new MerkleTree(leaves);
    const merkleRoot = tree.getRoot();
    const batchKey = blockchainData.batchKey || ethers.keccak256(ethers.toUtf8Bytes(`BATCH:${importBatchId}`));

    // 3. Prepare inventory documents with Merkle proofs - saved directly as on-chain anchored!
    const documentsToInsert = validationResult.rows.map((row, idx) => ({
      supplierWalletAddress: normalizedAddress,
      supplierCompanyName: supplierProfile.companyName || supplierUser?.name || 'Authorized Supplier',
      productId: row.data.productId,
      warrantyId: row.data.warrantyId,
      productName: row.data.productName,
      brand: row.data.brand || supplierProfile.brandName || '',
      modelNumber: row.data.modelNumber,
      variant: row.data.variant || '',
      manufacturerSerialNumber: row.data.manufacturerSerialNumber,
      warrantyDurationMonths: row.data.warrantyDurationMonths,
      warrantyStartRule: row.data.warrantyStartRule,
      purchaseOrderNumber: row.data.purchaseOrderNumber || metadata.purchaseOrderNumber || '',
      shipmentReference: row.data.shipmentReference || metadata.shipmentReference || '',
      receivedDate: row.data.receivedDate,
      purchaseDate: row.data.purchaseDate,
      status: 'unclaimed',
      importBatchId,
      importRowNumber: row.rowNumber,
      merkleLeaf: leaves[idx],
      merkleProof: tree.getProof(idx),
      blockchainAnchored: true,
      blockchainTxHash: txHash
    }));

    await SupplierInventory.insertMany(documentsToInsert, { ordered: true });

    // 4. Create batch on-chain commitment record - already anchored!
    const batchRecord = new SupplierBatch({
      batchId: importBatchId,
      batchKey,
      supplierWalletAddress: normalizedAddress,
      supplierCompanyName: supplierProfile.companyName || supplierUser?.name || 'Authorized Supplier',
      brand: supplierProfile.brandName || '',
      unitCount: documentsToInsert.length,
      merkleRoot,
      blockchainStatus: 'anchored',
      blockchainTxHash: txHash,
      blockchainBlock: blockNumber || null,
      anchoredAt: new Date(),
      purchaseOrderNumber: metadata.purchaseOrderNumber || '',
      shipmentReference: metadata.shipmentReference || ''
    });

    await batchRecord.save();

    return {
      success: true,
      importBatchId,
      batchKey,
      merkleRoot,
      insertedCount: documentsToInsert.length,
      supplierBrand: supplierProfile.brandName || '',
      importedAt: new Date().toISOString()
    };
  }

  /**
   * Anchor a committed batch on-chain via txHash submitted by supplier signer.
   */
  async anchorBatchOnChain(supplierWalletAddress, batchId, { txHash, blockNumber }) {
    if (!txHash) {
      throw Object.assign(new Error('Transaction hash is required to anchor batch.'), { status: 400 });
    }

    const normalizedAddress = supplierWalletAddress.toLowerCase();
    const batch = await SupplierBatch.findOne({
      batchId,
      supplierWalletAddress: normalizedAddress
    });

    if (!batch) {
      throw Object.assign(new Error(`Batch ${batchId} not found for this supplier.`), { status: 404 });
    }

    batch.blockchainStatus = 'anchored';
    batch.blockchainTxHash = txHash;
    batch.blockchainBlock = blockNumber || null;
    batch.anchoredAt = new Date();
    await batch.save();

    // Mark all inventory items in this batch as anchored
    await SupplierInventory.updateMany(
      { importBatchId: batchId, supplierWalletAddress: normalizedAddress },
      { $set: { blockchainAnchored: true, blockchainTxHash: txHash } }
    );

    return batch;
  }

  /**
   * Fetch a single batch record with its Merkle root and blockchain status.
   */
  async getBatch(supplierWalletAddress, batchId) {
    const normalizedAddress = supplierWalletAddress.toLowerCase();
    const batch = await SupplierBatch.findOne({
      batchId,
      supplierWalletAddress: normalizedAddress
    });
    if (!batch) {
      throw Object.assign(new Error(`Batch ${batchId} not found.`), { status: 404 });
    }
    return batch;
  }

  /**
   * Fetch paginated list of inventory items with filtering and search.
   */
  async getInventoryList(supplierWalletAddress, query = {}) {
    const normalizedAddress = supplierWalletAddress.toLowerCase();
    const { status, search, page = 1, limit = 50 } = query;

    const filter = { supplierWalletAddress: normalizedAddress };

    if (status && ['unclaimed', 'registered', 'voided'].includes(status)) {
      filter.status = status;
    }

    if (search && String(search).trim()) {
      const term = String(search).trim();
      filter.$or = [
        { manufacturerSerialNumber: { $regex: term, $options: 'i' } },
        { productName: { $regex: term, $options: 'i' } },
        { modelNumber: { $regex: term, $options: 'i' } },
        { productId: { $regex: term, $options: 'i' } },
        { warrantyId: { $regex: term, $options: 'i' } }
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      SupplierInventory.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      SupplierInventory.countDocuments(filter)
    ]);

    const metrics = await this.getInventoryMetrics(normalizedAddress);

    return {
      items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1
      },
      metrics
    };
  }

  /**
   * Summary metrics for dashboard badges.
   */
  async getInventoryMetrics(supplierWalletAddress) {
    const normalizedAddress = supplierWalletAddress.toLowerCase();

    const [totalUnits, unclaimedUnits, registeredUnits, voidedUnits] = await Promise.all([
      SupplierInventory.countDocuments({ supplierWalletAddress: normalizedAddress }),
      SupplierInventory.countDocuments({ supplierWalletAddress: normalizedAddress, status: 'unclaimed' }),
      SupplierInventory.countDocuments({ supplierWalletAddress: normalizedAddress, status: 'registered' }),
      SupplierInventory.countDocuments({ supplierWalletAddress: normalizedAddress, status: 'voided' })
    ]);

    return {
      totalUnits,
      unclaimedUnits,
      registeredUnits,
      voidedUnits
    };
  }

  /**
   * Return official CSV template string.
   */
  getCsvTemplate() {
    const header = [
      'productId',
      'warrantyId',
      'productName',
      'modelNumber',
      'manufacturerSerialNumber',
      'warrantyDurationMonths',
      'warrantyStartRule',
      'brand',
      'variant',
      'purchaseOrderNumber',
      'shipmentReference',
      'receivedDate',
      'purchaseDate'
    ].join(',');

    const sampleRow1 = [
      'PRD-APL-IP15PM',
      'WAR-2026-00101',
      'iPhone 15 Pro Max',
      'A3106',
      'F2LQX98J0D',
      '12',
      'purchase_date',
      'Apple',
      '256GB Natural Titanium',
      'PO-9921',
      'SHIP-7712',
      '2026-03-01',
      '2026-03-05'
    ].join(',');

    const sampleRow2 = [
      'PRD-APL-IP15PM',
      'WAR-2026-00102',
      'iPhone 15 Pro Max',
      'A3106',
      'F2LQX98J0E',
      '12',
      'activation_date',
      'Apple',
      '256GB Natural Titanium',
      'PO-9921',
      'SHIP-7712',
      '2026-03-01',
      ''
    ].join(',');

    return `${header}\n${sampleRow1}\n${sampleRow2}\n`;
  }
}

module.exports = new SupplierInventoryService();
