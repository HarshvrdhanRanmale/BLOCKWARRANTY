const crypto = require('crypto');
const User = require('../models/User');
const SupplierInvoiceSubmission = require('../models/SupplierInvoiceSubmission');
const SupplierClaimTicket = require('../models/SupplierClaimTicket');
const SupplierInventory = require('../models/SupplierInventory');
const supplierVerificationService = require('../services/supplierVerificationService');

// ─────────────────────────────────────────────────────────────────────────────
// INVOICE CONTROLLERS
// ─────────────────────────────────────────────────────────────────────────────

exports.listInvoices = async (req, res) => {
  try {
    const normalizedAddress = req.user.walletAddress.toLowerCase();
    const filter = { supplierWalletAddress: normalizedAddress };
    if (req.query.status && req.query.status !== 'all') {
      filter.validationState = req.query.status;
    }

    const submissions = await SupplierInvoiceSubmission.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    // Dynamically resolve actual customer names for every user
    const customerWallets = [
      ...new Set(
        submissions
          .map((s) => String(s.customerWallet || '').toLowerCase())
          .filter(Boolean)
      )
    ];

    if (customerWallets.length > 0) {
      const users = await User.find(
        { walletAddress: { $in: customerWallets } },
        'walletAddress name email'
      ).lean();

      const userMap = new Map();
      for (const u of users) {
        const addr = String(u.walletAddress || '').toLowerCase();
        const displayName = u.name?.trim() || (u.email ? u.email.split('@')[0] : '');
        if (displayName) {
          userMap.set(addr, displayName);
        }
      }

      for (const sub of submissions) {
        const addr = String(sub.customerWallet || '').toLowerCase();
        const matchedName = userMap.get(addr);
        if (matchedName && (!sub.customerName || sub.customerName.toLowerCase() === 'retail customer')) {
          sub.customerName = matchedName;
        }
      }
    }

    const counts = {
      total: await SupplierInvoiceSubmission.countDocuments({ supplierWalletAddress: normalizedAddress }),
      auto_passed: await SupplierInvoiceSubmission.countDocuments({ supplierWalletAddress: normalizedAddress, validationState: 'auto_passed' }),
      needs_review: await SupplierInvoiceSubmission.countDocuments({ supplierWalletAddress: normalizedAddress, validationState: 'needs_review' }),
      auto_rejected: await SupplierInvoiceSubmission.countDocuments({ supplierWalletAddress: normalizedAddress, validationState: 'auto_rejected' }),
      overridden: await SupplierInvoiceSubmission.countDocuments({ supplierWalletAddress: normalizedAddress, validationState: { $in: ['manually_approved', 'manually_rejected'] } })
    };

    return res.status(200).json({ success: true, submissions, counts });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

exports.evaluateInvoice = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const result = await supplierVerificationService.evaluateInvoiceSubmission(
      submissionId,
      req.user.walletAddress
    );
    return res.status(200).json({ success: true, submission: result });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, error: err.message });
  }
};

exports.overrideInvoice = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { action, notes } = req.body; // action: 'approve' | 'reject'
    const normalizedAddress = req.user.walletAddress.toLowerCase();

    const submission = await SupplierInvoiceSubmission.findOne({
      submissionId,
      supplierWalletAddress: normalizedAddress
    });

    if (!submission) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    submission.validationState = action === 'approve' ? 'manually_approved' : 'manually_rejected';
    submission.decisionNotes = notes || `Manually ${action}d by authorized supplier agent.`;
    submission.reasonCodes.push({
      code: action === 'approve' ? 'OVERRIDE_SUPPLIER_APPROVED' : 'OVERRIDE_SUPPLIER_REJECTED',
      severity: action === 'approve' ? 'info' : 'warning',
      message: submission.decisionNotes
    });
    submission.evaluatedAt = new Date();
    await submission.save();

    return res.status(200).json({ success: true, submission });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

exports.seedDemoInvoices = async (req, res) => {
  try {
    const normalizedAddress = req.user.walletAddress.toLowerCase();
    const brand = req.user?.supplierProfile?.brandName || 'Apple';

    // Find any real serials from this supplier's inventory to create realistic submissions
    const units = await SupplierInventory.find({ supplierWalletAddress: normalizedAddress }).limit(3);

    const validSerial = units[0]?.manufacturerSerialNumber || 'F2LQX98J0D';
    const secondSerial = units[1]?.manufacturerSerialNumber || 'F2LQX98J0E';

    const demoSubmissions = [
      {
        submissionId: `INV-SUB-${Date.now()}-101`,
        supplierWalletAddress: normalizedAddress,
        brand,
        customerWallet: '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc',
        customerName: 'Marcus Vance',
        fileName: 'Invoice_AppleStore_9821.pdf',
        fileHash: crypto.createHash('sha256').update(`invoice_sample_1_${Date.now()}`).digest('hex'),
        invoiceNumber: 'INV-2026-9821',
        extractedData: {
          serialNumber: validSerial,
          productName: units[0]?.productName || 'iPhone 15 Pro Max',
          modelNumber: units[0]?.modelNumber || 'A3106',
          invoiceNumber: 'INV-2026-9821',
          purchaseDate: '2026-03-05',
          sellerName: 'Apple Flagship Store BKC',
          sellerGstin: '27AABCA1234F1Z8',
          invoiceIssuerType: 'supplier_direct',
          confidenceScore: 98
        },
        validationState: 'pending'
      },
      {
        submissionId: `INV-SUB-${Date.now()}-102`,
        supplierWalletAddress: normalizedAddress,
        brand,
        customerWallet: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
        customerName: 'Priya Sharma',
        fileName: 'Scan_Receipt_Retailer.jpg',
        fileHash: crypto.createHash('sha256').update(`invoice_sample_2_${Date.now()}`).digest('hex'),
        invoiceNumber: 'RET-8812',
        extractedData: {
          serialNumber: secondSerial,
          productName: units[1]?.productName || 'iPhone 15 Pro Max',
          modelNumber: units[1]?.modelNumber || 'A3106',
          invoiceNumber: 'RET-8812',
          purchaseDate: '2026-03-10',
          sellerName: 'Chroma Electronics Retailer',
          sellerGstin: '27AAACL9921B1Z2',
          invoiceIssuerType: 'authorized_retailer',
          confidenceScore: 74 // Below 80% threshold -> Triggers NEEDS_REVIEW
        },
        validationState: 'pending'
      },
      {
        submissionId: `INV-SUB-${Date.now()}-103`,
        supplierWalletAddress: normalizedAddress,
        brand,
        customerWallet: '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65',
        customerName: 'David Kim',
        fileName: 'Online_Order_Slip.pdf',
        fileHash: crypto.createHash('sha256').update(`invoice_sample_3_${Date.now()}`).digest('hex'),
        invoiceNumber: 'ORD-9901',
        extractedData: {
          serialNumber: 'COUNTERFEIT-SERIAL-999',
          productName: 'iPhone 15 Pro Max',
          modelNumber: 'A3106',
          invoiceNumber: 'ORD-9901',
          purchaseDate: '2028-12-01', // Future date -> Triggers AUTO_REJECT
          sellerName: 'Unknown Marketplace Reseller',
          sellerGstin: '',
          invoiceIssuerType: 'third_party_unknown',
          confidenceScore: 96
        },
        validationState: 'pending'
      }
    ];

    await SupplierInvoiceSubmission.insertMany(demoSubmissions);

    return res.status(201).json({
      success: true,
      message: 'Created 3 representative demo invoice submissions in queue.'
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// WARRANTY CLAIMS CONTROLLERS
// ─────────────────────────────────────────────────────────────────────────────

exports.listClaims = async (req, res) => {
  try {
    const normalizedAddress = req.user.walletAddress.toLowerCase();
    const filter = { supplierWalletAddress: normalizedAddress };
    if (req.query.status && req.query.status !== 'all') {
      filter.validationState = req.query.status;
    }

    const tickets = await SupplierClaimTicket.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    // 1. Auto-evaluate any pending tickets so they are automatically adjudicated without needing manual button clicks
    const supplierVerificationService = require('../services/supplierVerificationService');
    for (const t of tickets) {
      if (t.validationState === 'pending') {
        try {
          const evaluated = await supplierVerificationService.evaluateWarrantyClaim(t.ticketId, normalizedAddress);
          if (evaluated) {
            Object.assign(t, evaluated.toObject ? evaluated.toObject() : evaluated);
          }
        } catch (evalErr) {
          console.warn(`Auto-evaluation failed for ticket ${t.ticketId}:`, evalErr.message);
        }
      }
    }

    // 2. Dynamically resolve actual customer names
    const claimCustomerWallets = [
      ...new Set(
        tickets
          .map((t) => String(t.customerWallet || '').toLowerCase())
          .filter(Boolean)
      )
    ];

    const genericNames = new Set(['retail customer', 'registered customer', 'customer', 'unknown', '']);

    if (claimCustomerWallets.length > 0) {
      const users = await User.find(
        { walletAddress: { $in: claimCustomerWallets } },
        'walletAddress name email'
      ).lean();

      const userMap = new Map();
      for (const u of users) {
        const addr = String(u.walletAddress || '').toLowerCase();
        const displayName = u.name?.trim() || (u.email ? u.email.split('@')[0] : '');
        if (displayName && !genericNames.has(displayName.toLowerCase())) {
          userMap.set(addr, displayName);
        }
      }

      // Also check SupplierInvoiceSubmission for customer names
      const SupplierInvoiceSubmission = require('../models/SupplierInvoiceSubmission');
      const invoiceSubs = await SupplierInvoiceSubmission.find(
        { customerWallet: { $in: claimCustomerWallets } },
        'customerWallet customerName'
      ).lean();
      for (const sub of invoiceSubs) {
        const addr = String(sub.customerWallet || '').toLowerCase();
        if (sub.customerName && !userMap.has(addr)) {
          const trimmed = sub.customerName.trim();
          if (trimmed && !genericNames.has(trimmed.toLowerCase())) {
            userMap.set(addr, trimmed);
          }
        }
      }

      // Also check Product records
      const Product = require('../models/Product');
      const productIds = [...new Set(tickets.map((t) => t.productId).filter(Boolean))];
      const products = await Product.find({ productId: { $in: productIds } }).lean();
      const productMap = new Map();
      for (const p of products) {
        const cName = p.customerName || p.buyerName || p.invoiceExtractedData?.customerName;
        if (cName && !genericNames.has(String(cName).trim().toLowerCase())) {
          productMap.set(p.productId, String(cName).trim());
        }
      }

      for (const t of tickets) {
        const addr = String(t.customerWallet || '').toLowerCase();
        const isGeneric = !t.customerName || genericNames.has(String(t.customerName).trim().toLowerCase());
        const resolvedName = userMap.get(addr) || productMap.get(t.productId);
        if (isGeneric && resolvedName) {
          t.customerName = resolvedName;
          SupplierClaimTicket.updateOne({ ticketId: t.ticketId }, { customerName: resolvedName }).exec().catch(() => {});
        }
      }
    }

    const counts = {
      total: await SupplierClaimTicket.countDocuments({ supplierWalletAddress: normalizedAddress }),
      auto_passed: await SupplierClaimTicket.countDocuments({ supplierWalletAddress: normalizedAddress, validationState: 'auto_passed' }),
      needs_review: await SupplierClaimTicket.countDocuments({ supplierWalletAddress: normalizedAddress, validationState: 'needs_review' }),
      auto_rejected: await SupplierClaimTicket.countDocuments({ supplierWalletAddress: normalizedAddress, validationState: 'auto_rejected' }),
      overridden: await SupplierClaimTicket.countDocuments({ supplierWalletAddress: normalizedAddress, validationState: { $in: ['manually_approved', 'manually_rejected'] } })
    };

    return res.status(200).json({ success: true, tickets, counts });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

exports.evaluateClaim = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const result = await supplierVerificationService.evaluateWarrantyClaim(
      ticketId,
      req.user.walletAddress
    );
    return res.status(200).json({ success: true, ticket: result });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, error: err.message });
  }
};

exports.overrideClaim = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { action, notes } = req.body;
    const normalizedAddress = req.user.walletAddress.toLowerCase();

    const ticket = await SupplierClaimTicket.findOne({
      ticketId,
      supplierWalletAddress: normalizedAddress
    });

    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Claim ticket not found' });
    }

    ticket.validationState = action === 'approve' ? 'manually_approved' : 'manually_rejected';
    ticket.decisionNotes = notes || `Manually ${action}d by authorized service manager.`;
    ticket.reasonCodes.push({
      code: action === 'approve' ? 'OVERRIDE_SERVICE_APPROVED' : 'OVERRIDE_SERVICE_REJECTED',
      severity: action === 'approve' ? 'info' : 'warning',
      message: ticket.decisionNotes
    });
    ticket.evaluatedAt = new Date();
    await ticket.save();

    return res.status(200).json({ success: true, ticket });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

exports.seedDemoClaims = async (req, res) => {
  try {
    const normalizedAddress = req.user.walletAddress.toLowerCase();
    const brand = req.user?.supplierProfile?.brandName || 'Apple';

    // Find real serials from supplier inventory
    const units = await SupplierInventory.find({ supplierWalletAddress: normalizedAddress }).limit(3);
    const registeredSerial = units[0]?.manufacturerSerialNumber || 'F2LQX98J0D';

    // Make sure unit 0 has activated warranty for realistic testing
    if (units[0] && !units[0].activatedWarrantyExpiry) {
      const exp = new Date();
      exp.setFullYear(exp.getFullYear() + 1);
      units[0].status = 'registered';
      units[0].activatedWarrantyExpiry = exp;
      await units[0].save();
    }

    const demoClaims = [
      {
        ticketId: `CLM-TKT-${Date.now()}-201`,
        supplierWalletAddress: normalizedAddress,
        brand,
        customerWallet: '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc',
        customerName: 'Marcus Vance',
        productId: units[0]?.productId || 'PRD-APL-IP15PM',
        manufacturerSerialNumber: registeredSerial,
        productName: units[0]?.productName || 'iPhone 15 Pro Max',
        claimType: 'repair',
        issueCategory: 'component_malfunction',
        issueDescription: 'Front TrueDepth camera sensor failure. Face ID disabled unexpectedly.',
        claimDate: new Date(),
        diagnosticEvidence: {
          hasDiagnosticLog: true,
          diagnosticCode: 'AST2-CAM-ERR-44',
          diagnosticConfidence: 94, // High diagnostic confidence -> AUTO_PASS
          hasPhotos: true,
          photoCount: 2,
          isAccidentalDamageReported: false
        },
        validationState: 'pending'
      },
      {
        ticketId: `CLM-TKT-${Date.now()}-202`,
        supplierWalletAddress: normalizedAddress,
        brand,
        customerWallet: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
        customerName: 'Priya Sharma',
        productId: units[0]?.productId || 'PRD-APL-IP15PM',
        manufacturerSerialNumber: registeredSerial,
        productName: units[0]?.productName || 'iPhone 15 Pro Max',
        claimType: 'repair',
        issueCategory: 'liquid_damage', // Water ingress -> Policy exclusion -> NEEDS_REVIEW
        issueDescription: 'Device submerged in pool water. Display turns off and back on intermittently.',
        claimDate: new Date(),
        diagnosticEvidence: {
          hasDiagnosticLog: false,
          diagnosticCode: '',
          diagnosticConfidence: 0,
          hasPhotos: true,
          photoCount: 3,
          isAccidentalDamageReported: true
        },
        validationState: 'pending'
      },
      {
        ticketId: `CLM-TKT-${Date.now()}-203`,
        supplierWalletAddress: normalizedAddress,
        brand,
        customerWallet: '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65',
        customerName: 'David Kim',
        productId: 'PRD-APL-IP12',
        manufacturerSerialNumber: 'EXPIRED-SERIAL-1234',
        productName: 'iPhone 12 Pro',
        claimType: 'replacement',
        issueCategory: 'battery_degradation',
        issueDescription: 'Battery health degraded below 70%. Requesting replacement unit.',
        claimDate: new Date(),
        diagnosticEvidence: {
          hasDiagnosticLog: true,
          diagnosticCode: 'BATT-CYCLE-1200',
          diagnosticConfidence: 99,
          hasPhotos: false,
          photoCount: 0,
          isAccidentalDamageReported: false
        },
        validationState: 'pending' // Will AUTO_REJECT because serial not found / lapsed
      }
    ];

    await SupplierClaimTicket.insertMany(demoClaims);

    return res.status(201).json({
      success: true,
      message: 'Created 3 representative demo claim tickets in queue.'
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
