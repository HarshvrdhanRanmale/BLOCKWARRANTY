const express = require('express');
const router = express.Router();
const controller = require('../controllers/supplierVerificationController');
const { authenticate, requireSupplier } = require('../middleware/auth');

router.use(authenticate, requireSupplier);

// Invoice validation routes
router.get('/invoices', controller.listInvoices);
router.post('/invoices/seed-demo', controller.seedDemoInvoices);
router.post('/invoices/:submissionId/evaluate', controller.evaluateInvoice);
router.post('/invoices/:submissionId/override', controller.overrideInvoice);

// Warranty claims validation routes
router.get('/claims', controller.listClaims);
router.post('/claims/seed-demo', controller.seedDemoClaims);
router.post('/claims/:ticketId/evaluate', controller.evaluateClaim);
router.post('/claims/:ticketId/override', controller.overrideClaim);

module.exports = router;
