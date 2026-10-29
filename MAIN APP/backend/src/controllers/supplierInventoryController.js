const supplierInventoryService = require('../services/supplierInventoryService');
const User = require('../models/User');

exports.validateBatch = async (req, res) => {
  try {
    const { rows } = req.body;
    if (!rows || !Array.isArray(rows)) {
      return res.status(400).json({
        success: false,
        error: "Invalid request payload: 'rows' must be an array of inventory objects."
      });
    }

    const supplierUser = await User.findOne({ walletAddress: req.user.walletAddress.toLowerCase() });
    const profile = supplierUser?.supplierProfile || {};

    const result = await supplierInventoryService.validateCsvRows(
      req.user.walletAddress,
      rows,
      profile
    );

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      success: false,
      error: err.message
    });
  }
};

exports.importBatch = async (req, res) => {
  try {
    const { rows, metadata, txHash, blockNumber, importBatchId, merkleRoot, batchKey } = req.body;
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Missing rows to import: 'rows' must be a non-empty array."
      });
    }

    if (!txHash) {
      return res.status(400).json({
        success: false,
        error: "Batch must be registered on the blockchain before saving to the database."
      });
    }

    const result = await supplierInventoryService.commitBatchImport(
      req.user.walletAddress,
      rows,
      metadata || {},
      { txHash, blockNumber, importBatchId, merkleRoot, batchKey }
    );

    return res.status(201).json({
      success: true,
      message: `Successfully imported and anchored ${result.insertedCount} unit(s) into inventory.`,
      ...result
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      success: false,
      error: err.message,
      details: err.details || null
    });
  }
};

exports.clearInventory = async (req, res) => {
  try {
    const normalizedAddress = req.user.walletAddress.toLowerCase();
    const SupplierInventory = require('../models/SupplierInventory');
    const SupplierBatch = require('../models/SupplierBatch');
    const delInv = await SupplierInventory.deleteMany({ supplierWalletAddress: normalizedAddress });
    const delBatch = await SupplierBatch.deleteMany({ supplierWalletAddress: normalizedAddress });
    return res.status(200).json({
      success: true,
      message: `Cleared ${delInv.deletedCount} inventory unit(s) and ${delBatch.deletedCount} batch(es).`
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

exports.listInventory = async (req, res) => {
  try {
    const result = await supplierInventoryService.getInventoryList(
      req.user.walletAddress,
      req.query
    );

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

exports.getMetrics = async (req, res) => {
  try {
    const metrics = await supplierInventoryService.getInventoryMetrics(
      req.user.walletAddress
    );

    return res.status(200).json({
      success: true,
      metrics
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

exports.anchorBatch = async (req, res) => {
  try {
    const { batchId } = req.params;
    const { txHash, blockNumber } = req.body;
    const result = await supplierInventoryService.anchorBatchOnChain(
      req.user.walletAddress,
      batchId,
      { txHash, blockNumber }
    );
    return res.status(200).json({
      success: true,
      message: 'Batch successfully anchored to the blockchain on-chain registry.',
      batch: result
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      success: false,
      error: err.message
    });
  }
};

exports.getBatch = async (req, res) => {
  try {
    const { batchId } = req.params;
    const batch = await supplierInventoryService.getBatch(req.user.walletAddress, batchId);
    return res.status(200).json({
      success: true,
      batch
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      success: false,
      error: err.message
    });
  }
};

exports.downloadTemplate = (req, res) => {
  const csvContent = supplierInventoryService.getCsvTemplate();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="blockwarranty_supplier_inventory_template.csv"');
  return res.status(200).send(csvContent);
};
