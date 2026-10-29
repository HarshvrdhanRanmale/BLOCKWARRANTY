const express = require('express');
const router = express.Router();
const supplierInventoryController = require('../controllers/supplierInventoryController');
const { authenticate, requireSupplier } = require('../middleware/auth');

// Public downloadable template (no sensitive data)
router.get('/template', supplierInventoryController.downloadTemplate);

// All operational inventory endpoints require authenticated supplier access
router.use(authenticate, requireSupplier);

router.get('/metrics', supplierInventoryController.getMetrics);
router.get('/', supplierInventoryController.listInventory);
router.post('/validate', supplierInventoryController.validateBatch);
router.post('/import', supplierInventoryController.importBatch);
router.delete('/clear', supplierInventoryController.clearInventory);
router.get('/batches/:batchId', supplierInventoryController.getBatch);
router.post('/batches/:batchId/anchor', supplierInventoryController.anchorBatch);

module.exports = router;
