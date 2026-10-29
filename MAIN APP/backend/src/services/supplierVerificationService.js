const crypto = require('crypto');
const User = require('../models/User');
const SupplierInventory = require('../models/SupplierInventory');
const SupplierInvoiceSubmission = require('../models/SupplierInvoiceSubmission');
const SupplierClaimTicket = require('../models/SupplierClaimTicket');
const Product = require('../models/Product');
const checkWarrantyProvider = require('./warrantyProviders/checkWarrantyProvider');

const escapeRegExp = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

class SupplierVerificationService {
  /**
   * Run automated evaluation engine on a supplier invoice submission
   */
  async evaluateInvoiceSubmission(submissionId, supplierWalletAddress) {
    const normalizedAddress = supplierWalletAddress.toLowerCase();
    const submission = await SupplierInvoiceSubmission.findOne({
      submissionId,
      supplierWalletAddress: normalizedAddress
    });

    if (!submission) {
      throw Object.assign(new Error('Invoice submission ticket not found.'), { status: 404 });
    }

    if (!submission.customerName || submission.customerName.toLowerCase() === 'retail customer') {
      try {
        const u = await User.findOne({ walletAddress: String(submission.customerWallet || '').toLowerCase() }).lean();
        if (u?.name?.trim()) {
          submission.customerName = u.name.trim();
        }
      } catch (_) {}
    }

    const reasons = [];
    const extracted = submission.extractedData || {};
    const serial = String(extracted.serialNumber || '').trim();
    let finalVerdict = 'pending';
    let matchedUnitDoc = null;

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: File Hash & Duplicate Identification (Non-Punitive Duplicate Flagging)
    // ─────────────────────────────────────────────────────────────────────────
    if (submission.fileHash) {
      const duplicateFileSubs = await SupplierInvoiceSubmission.find({
        supplierWalletAddress: normalizedAddress,
        fileHash: submission.fileHash,
        submissionId: { $ne: submission.submissionId }
      }).limit(5);

      if (duplicateFileSubs.length > 0) {
        const sameCustomer = duplicateFileSubs.every(
          (s) => s.customerWallet && s.customerWallet.toLowerCase() === submission.customerWallet.toLowerCase()
        );
        if (sameCustomer) {
          reasons.push({
            code: 'FLAG_DUPLICATE_FILE_RESUBMISSION',
            severity: 'info',
            message: `Duplicate file hash (${submission.fileHash.slice(0, 10)}…) detected from same customer. Flagged as re-submission / re-upload.`
          });
        } else {
          reasons.push({
            code: 'REV_DUPLICATE_FILE_CROSS_ACCOUNT',
            severity: 'warning',
            message: `Identical invoice file previously submitted by a different account (${duplicateFileSubs[0].submissionId}). Manual verification required.`
          });
        }
      }
    }

    // Duplicate invoice number check
    if (extracted.invoiceNumber) {
      const duplicateInvoiceSubs = await SupplierInvoiceSubmission.find({
        supplierWalletAddress: normalizedAddress,
        'extractedData.invoiceNumber': extracted.invoiceNumber,
        submissionId: { $ne: submission.submissionId },
        validationState: { $in: ['auto_passed', 'manually_approved'] }
      });

      if (duplicateInvoiceSubs.length > 0) {
        reasons.push({
          code: 'REV_INVOICE_NUMBER_ALREADY_CLAIMED',
          severity: 'warning',
          message: `Invoice number #${extracted.invoiceNumber} is already associated with approved submission ${duplicateInvoiceSubs[0].submissionId}. Flagged for review.`
        });
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 2: OCR / AI Extraction Confidence Evaluation
    // ─────────────────────────────────────────────────────────────────────────
    const confidence = Number(extracted.confidenceScore || submission.ocrConfidence || 0);
    if (!serial) {
      reasons.push({
        code: 'REV_OCR_SERIAL_MISSING',
        severity: 'warning',
        message: 'Could not extract hardware serial number from invoice document. Visual inspection required.'
      });
    } else if (confidence < 80) {
      reasons.push({
        code: 'REV_OCR_CONFIDENCE_LOW',
        severity: 'warning',
        message: `OCR extraction confidence is ${confidence}% (below 80% threshold). OCR character misread possible (e.g. 0 vs O).`
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 3: Atomic Reservation Lock (Race-Condition & Concurrent Claim Protection)
    // ─────────────────────────────────────────────────────────────────────────
    const serialRegex = serial ? new RegExp(`^${escapeRegExp(serial)}$`, 'i') : null;

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 3: Atomic Reservation Lock (Race-Condition & Concurrent Claim Protection)
    // ─────────────────────────────────────────────────────────────────────────
    const now = new Date();
    const leaseExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5-minute lease with automatic recovery

    if (serialRegex) {
      // Atomically check availability and acquire reservation lease by serial
      matchedUnitDoc = await SupplierInventory.findOneAndUpdate(
        {
          supplierWalletAddress: normalizedAddress,
          manufacturerSerialNumber: { $regex: serialRegex },
          $or: [
            { lockedBySubmissionId: null },
            { lockExpiresAt: { $lt: now } },
            { lockedBySubmissionId: submission.submissionId }
          ]
        },
        {
          $set: {
            lockedBySubmissionId: submission.submissionId,
            lockExpiresAt: leaseExpiresAt
          }
        },
        { returnDocument: 'after' }
      );

      // If findOneAndUpdate failed to acquire lock because of an active concurrent lease
      if (!matchedUnitDoc) {
        const currentlyLockedUnit = await SupplierInventory.findOne({
          supplierWalletAddress: normalizedAddress,
          manufacturerSerialNumber: { $regex: serialRegex }
        });

        if (currentlyLockedUnit && currentlyLockedUnit.lockedBySubmissionId) {
          reasons.push({
            code: 'REV_CONCURRENT_SUBMISSION_LOCK',
            severity: 'warning',
            message: `Serial ${serial} is actively reserved by concurrent submission (${currentlyLockedUnit.lockedBySubmissionId}). Lease expires in 5 minutes.`
          });
        }
      }
    }

    // Fallback: If serial didn't match directly, try matching by invoice number (or OCR-variant) in inventory
    if (!matchedUnitDoc && extracted.invoiceNumber) {
      const cleanInv = String(extracted.invoiceNumber).trim();
      const invPattern = escapeRegExp(cleanInv).replace(/[0O]/g, '[0O]');
      const invRegex = new RegExp(invPattern, 'i');

      matchedUnitDoc = await SupplierInventory.findOneAndUpdate(
        {
          supplierWalletAddress: normalizedAddress,
          $or: [
            { manufacturerSerialNumber: { $regex: invRegex } },
            { variant: { $regex: invRegex } },
            { purchaseOrderNumber: { $regex: invRegex } },
            { shipmentReference: { $regex: invRegex } }
          ],
          $or: [
            { lockedBySubmissionId: null },
            { lockExpiresAt: { $lt: now } },
            { lockedBySubmissionId: submission.submissionId }
          ]
        },
        {
          $set: {
            lockedBySubmissionId: submission.submissionId,
            lockExpiresAt: leaseExpiresAt
          }
        },
        { returnDocument: 'after' }
      );

      if (matchedUnitDoc) {
        // Automatically sync matched authoritative serial number
        submission.extractedData.serialNumber = matchedUnitDoc.manufacturerSerialNumber;
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 4: Deterministic Catalog & Existence Rules
    // ─────────────────────────────────────────────────────────────────────────
    if (serialRegex && !matchedUnitDoc) {
      // Check if unit exists in supplier catalog at all
      const existingInCatalog = await SupplierInventory.findOne({
        supplierWalletAddress: normalizedAddress,
        manufacturerSerialNumber: { $regex: serialRegex }
      });

      if (!existingInCatalog) {
        if (confidence >= 95) {
          // Unambiguous deterministic rule: serial confirmed clearly read, but not in batch
          reasons.push({
            code: 'ERR_SERIAL_NOT_IN_SUPPLIER_CATALOG',
            severity: 'error',
            message: `Serial ${serial} does not exist in ${submission.brand || 'supplier'} manufactured inventory batches.`
          });
        } else {
          // If confidence was moderate, OCR might have misread a single character
          reasons.push({
            code: 'REV_SERIAL_NOT_FOUND_CHECK_OCR',
            severity: 'warning',
            message: `Serial ${serial} not found in catalog, but OCR confidence was ${confidence}%. Manual check for OCR misread recommended.`
          });
        }
      }
    } else if (matchedUnitDoc) {
      // Unit exists: Check deterministic status rules
      if (matchedUnitDoc.status === 'voided') {
        reasons.push({
          code: 'ERR_HARDWARE_UNIT_VOIDED',
          severity: 'error',
          message: `Hardware unit ${serial} is marked as VOIDED/DEFECT in the manufacturer registry.`
        });
      } else if (matchedUnitDoc.status === 'registered') {
        if (
          matchedUnitDoc.registeredByCustomer &&
          matchedUnitDoc.registeredByCustomer.toLowerCase() !== submission.customerWallet.toLowerCase()
        ) {
          let registeredOwnerName = '';
          try {
            const regUser = await User.findOne({
              walletAddress: matchedUnitDoc.registeredByCustomer.toLowerCase()
            }).lean();
            if (regUser && regUser.name && regUser.name.trim().toLowerCase() !== 'retail customer') {
              registeredOwnerName = regUser.name.trim();
            }
          } catch (_) {}

          const ownerDisplay = registeredOwnerName
            ? `under "${registeredOwnerName}"`
            : `to another customer account (${matchedUnitDoc.registeredByCustomer.slice(0, 6)}…${matchedUnitDoc.registeredByCustomer.slice(-4)})`;

          reasons.push({
            code: 'ERR_UNIT_ALREADY_REGISTERED_OTHER_CUSTOMER',
            severity: 'error',
            message: `Sorry, this product (Serial: ${serial}) is already registered ${ownerDisplay}. If you recently purchased this item second-hand, please request the previous owner to transfer ownership to your wallet via BlockWarranty.`
          });
        } else {
          reasons.push({
            code: 'INFO_UNIT_ALREADY_OWNED_BY_SUBMITTER',
            severity: 'info',
            message: `Serial ${serial} is already owned by this customer account. Updating documentation.`
          });
        }
      }

      // ─────────────────────────────────────────────────────────────────────
      // STEP 4B: Official Release Check — Was the product really released?
      // ─────────────────────────────────────────────────────────────────────
      if (!matchedUnitDoc.blockchainAnchored) {
        reasons.push({
          code: 'ERR_UNIT_NOT_OFFICIALLY_RELEASED',
          severity: 'error',
          message: `Serial ${serial} exists in supplier catalog but has NOT been anchored on-chain (Merkle batch not committed). Product is not officially released yet.`
        });
      } else {
        reasons.push({
          code: 'PASS_UNIT_BLOCKCHAIN_ANCHORED',
          severity: 'info',
          message: `Serial ${serial} is anchored on-chain via Merkle batch ${matchedUnitDoc.importBatchId || 'N/A'}. Product officially released.`
        });
      }

      // ─────────────────────────────────────────────────────────────────────
      // STEP 4C: Product Specification Cross-Match (Model, Brand, Variant)
      // ─────────────────────────────────────────────────────────────────────
      const claimedModel = String(extracted.modelNumber || '').trim().toLowerCase();
      const supplierModel = String(matchedUnitDoc.modelNumber || '').trim().toLowerCase();
      const claimedProduct = String(extracted.productName || '').trim().toLowerCase();
      const supplierProduct = String(matchedUnitDoc.productName || '').trim().toLowerCase();
      const claimedBrand = String(submission.brand || '').trim().toLowerCase();
      const supplierBrand = String(matchedUnitDoc.brand || '').trim().toLowerCase();

      if (claimedModel && supplierModel && claimedModel !== supplierModel) {
        reasons.push({
          code: 'REV_MODEL_NUMBER_MISMATCH',
          severity: 'warning',
          message: `Invoice model "${extracted.modelNumber}" does not match supplier ledger model "${matchedUnitDoc.modelNumber}" for serial ${serial}.`
        });
      } else if (claimedModel && supplierModel && claimedModel === supplierModel) {
        reasons.push({
          code: 'PASS_MODEL_NUMBER_MATCH',
          severity: 'info',
          message: `Model number "${matchedUnitDoc.modelNumber}" confirmed — matches supplier authoritative record.`
        });
      }

      const cleanClaimedProd = claimedProduct.replace(/[^a-z0-9]/gi, ' ').toLowerCase().trim();
      const cleanSupplierProd = supplierProduct.replace(/[^a-z0-9]/gi, ' ').toLowerCase().trim();
      const hasKeyWordMatch = cleanSupplierProd.split(' ').filter(w => w.length > 2).some(w => cleanClaimedProd.includes(w));
      const isProductMatch = cleanClaimedProd.includes(cleanSupplierProd) || cleanSupplierProd.includes(cleanClaimedProd) || hasKeyWordMatch;

      if (claimedProduct && supplierProduct && !isProductMatch) {
        reasons.push({
          code: 'REV_PRODUCT_NAME_MISMATCH',
          severity: 'warning',
          message: `Invoice product "${extracted.productName}" does not match supplier ledger product "${matchedUnitDoc.productName}".`
        });
      }

      if (claimedBrand && supplierBrand && claimedBrand !== supplierBrand) {
        reasons.push({
          code: 'ERR_BRAND_MISMATCH',
          severity: 'error',
          message: `Invoice submitted to brand "${submission.brand}" but serial ${serial} belongs to brand "${matchedUnitDoc.brand}" in supplier catalog.`
        });
      }

      // ─────────────────────────────────────────────────────────────────────
      // STEP 4D: Warranty Period Comparison
      // ─────────────────────────────────────────────────────────────────────
      if (matchedUnitDoc.warrantyDurationMonths) {
        reasons.push({
          code: 'INFO_WARRANTY_DURATION_FROM_SUPPLIER',
          severity: 'info',
          message: `Supplier authoritative warranty period: ${matchedUnitDoc.warrantyDurationMonths} months (start rule: ${matchedUnitDoc.warrantyStartRule || 'purchase_date'}).`
        });
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 5: Date Validation Rules
    // ─────────────────────────────────────────────────────────────────────────
    if (extracted.purchaseDate) {
      const pDate = new Date(extracted.purchaseDate);
      const now = new Date();
      now.setHours(23, 59, 59, 999);

      if (Number.isNaN(pDate.getTime())) {
        reasons.push({
          code: 'REV_INVALID_PURCHASE_DATE_FORMAT',
          severity: 'warning',
          message: `Purchase date '${extracted.purchaseDate}' could not be parsed as a valid calendar date.`
        });
      } else if (pDate > now) {
        // Unambiguous deterministic rejection: cannot purchase in the future
        reasons.push({
          code: 'ERR_PURCHASE_DATE_IN_FUTURE',
          severity: 'error',
          message: `Purchase date ${extracted.purchaseDate} is in the future. Disallowed by invoice policy.`
        });
      } else if (matchedUnitDoc && matchedUnitDoc.receivedDate) {
        const receivedDate = new Date(matchedUnitDoc.receivedDate);
        if (pDate < receivedDate) {
          // Customer claims purchase before supplier even received the batch
          reasons.push({
            code: 'ERR_PURCHASE_PREDATES_FACTORY_RELEASE',
            severity: 'error',
            message: `Purchase date (${extracted.purchaseDate}) is BEFORE the supplier batch receipt/release date (${receivedDate.toISOString().slice(0, 10)}). Temporal impossibility.`
          });
        } else {
          reasons.push({
            code: 'PASS_PURCHASE_DATE_AFTER_RELEASE',
            severity: 'info',
            message: `Purchase date (${extracted.purchaseDate}) is after supplier release date (${receivedDate.toISOString().slice(0, 10)}). Timeline valid.`
          });
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 6: Issuer Authenticity Assessment
    // ─────────────────────────────────────────────────────────────────────────
    if (extracted.invoiceIssuerType === 'supplier_direct') {
      reasons.push({
        code: 'INFO_ISSUER_GROUND_TRUTH_MATCH',
        severity: 'info',
        message: 'Invoice issued directly by supplier billing system (internal ground-truth source).'
      });
    } else if (extracted.sellerGstin) {
      reasons.push({
        code: 'INFO_SELLER_TAX_IDENTITY_PRESENT',
        severity: 'info',
        message: `Retailer GSTIN ${extracted.sellerGstin} present. Note: Tax ID confirms business existence, but not individual bill issuance without EDI feed.`
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BUILD INVENTORY COMPARISON MATRIX (for Audit Modal UI)
    // ─────────────────────────────────────────────────────────────────────────
    let inventoryComparison = null;
    if (matchedUnitDoc) {
      const claimedModel = String(extracted.modelNumber || '').trim().toLowerCase();
      const supplierModel = String(matchedUnitDoc.modelNumber || '').trim().toLowerCase();
      const claimedProduct = String(extracted.productName || '').trim().toLowerCase();
      const supplierProduct = String(matchedUnitDoc.productName || '').trim().toLowerCase();
      const claimedBrand = String(submission.brand || '').trim().toLowerCase();
      const supplierBrand = String(matchedUnitDoc.brand || '').trim().toLowerCase();

      inventoryComparison = {
        serialNumberMatch: {
          match: true,
          claimed: serial,
          supplier: matchedUnitDoc.manufacturerSerialNumber
        },
        modelMatch: {
          match: !claimedModel || !supplierModel || claimedModel === supplierModel,
          claimed: extracted.modelNumber || 'N/A',
          supplier: matchedUnitDoc.modelNumber || 'N/A'
        },
        productNameMatch: {
          match: !claimedProduct || !supplierProduct || supplierProduct.includes(claimedProduct) || claimedProduct.includes(supplierProduct),
          claimed: extracted.productName || 'N/A',
          supplier: matchedUnitDoc.productName || 'N/A'
        },
        brandMatch: {
          match: !claimedBrand || !supplierBrand || claimedBrand === supplierBrand,
          claimed: submission.brand || 'N/A',
          supplier: matchedUnitDoc.brand || 'N/A'
        },
        variantMatch: {
          match: true, // variant is informational
          claimed: extracted.variant || 'N/A',
          supplier: matchedUnitDoc.variant || 'N/A'
        },
        releaseStatus: {
          isAnchoredOnChain: matchedUnitDoc.blockchainAnchored || false,
          importBatchId: matchedUnitDoc.importBatchId || null,
          blockchainTxHash: matchedUnitDoc.blockchainTxHash || null,
          receivedReleaseDate: matchedUnitDoc.receivedDate ? matchedUnitDoc.receivedDate.toISOString().slice(0, 10) : null,
          purchaseDate: extracted.purchaseDate || null,
          timelineValid: (() => {
            if (!extracted.purchaseDate || !matchedUnitDoc.receivedDate) return null;
            return new Date(extracted.purchaseDate) >= new Date(matchedUnitDoc.receivedDate);
          })()
        },
        warrantyInfo: {
          supplierWarrantyMonths: matchedUnitDoc.warrantyDurationMonths || null,
          supplierWarrantyStartRule: matchedUnitDoc.warrantyStartRule || 'purchase_date',
          activatedExpiry: matchedUnitDoc.activatedWarrantyExpiry ? matchedUnitDoc.activatedWarrantyExpiry.toISOString().slice(0, 10) : null
        },
        inventoryStatus: matchedUnitDoc.status,
        productId: matchedUnitDoc.productId,
        warrantyId: matchedUnitDoc.warrantyId || null
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SYNTHESIZE FINAL VERDICT
    // ─────────────────────────────────────────────────────────────────────────
    const hasFatalError = reasons.some((r) => r.severity === 'error');
    const hasWarnings = reasons.some((r) => r.severity === 'warning');

    if (hasFatalError) {
      finalVerdict = 'auto_rejected';
      // Release reservation lock
      if (matchedUnitDoc) {
        await SupplierInventory.updateOne(
          { _id: matchedUnitDoc._id },
          { $set: { lockedBySubmissionId: null, lockExpiresAt: null } }
        );
      }
    } else if (hasWarnings || !matchedUnitDoc) {
      finalVerdict = 'needs_review';
    } else {
      finalVerdict = 'auto_passed';
      reasons.push({
        code: 'PASS_AUTHENTICATED_AND_COMMITTED',
        severity: 'info',
        message: 'Serial verified against on-chain anchored Merkle batch. Clean date, spec, and policy match. Product officially released by supplier.'
      });

      // Update unit to registered state
      const pDate = extracted.purchaseDate ? new Date(extracted.purchaseDate) : new Date();
      const expiry = new Date(pDate);
      expiry.setMonth(expiry.getMonth() + (matchedUnitDoc.warrantyDurationMonths || 12));

      await SupplierInventory.updateOne(
        { _id: matchedUnitDoc._id },
        {
          $set: {
            status: 'registered',
            purchaseDate: pDate,
            registeredByCustomer: submission.customerWallet || 'verified_customer',
            registeredAt: new Date(),
            activatedWarrantyExpiry: expiry,
            lockedBySubmissionId: null,
            lockExpiresAt: null
          }
        }
      );
    }

    submission.validationState = finalVerdict;
    submission.reasonCodes = reasons;
    submission.inventoryComparison = inventoryComparison;
    submission.evaluatedAt = new Date();
    if (matchedUnitDoc) submission.matchedInventoryUnit = matchedUnitDoc.manufacturerSerialNumber;
    await submission.save();

    return submission;
  }

  /**
   * Run automated evaluation engine on a supplier warranty claim ticket
   */
  async evaluateWarrantyClaim(ticketId, supplierWalletAddress) {
    const normalizedAddress = supplierWalletAddress.toLowerCase();
    const ticket = await SupplierClaimTicket.findOne({
      ticketId,
      supplierWalletAddress: normalizedAddress
    });

    if (!ticket) {
      throw Object.assign(new Error('Warranty claim ticket not found.'), { status: 404 });
    }

    const reasons = [];
    const serial = String(ticket.manufacturerSerialNumber || '').trim();
    let finalVerdict = 'pending';

    // ─────────────────────────────────────────────────────────────────────────
    // CHECK 1: Unit Existence & Identity Anchor
    // ─────────────────────────────────────────────────────────────────────────
    const unit = await SupplierInventory.findOne({
      supplierWalletAddress: normalizedAddress,
      manufacturerSerialNumber: serial
    });

    if (!unit) {
      reasons.push({
        code: 'ERR_CLAIM_UNIT_NOT_FOUND',
        severity: 'error',
        message: `Serial ${serial} not found in supplier inventory registry.`
      });
    } else {
      ticket.productName = unit.productName;

      // Status check
      if (unit.status === 'voided') {
        reasons.push({
          code: 'ERR_CLAIM_UNIT_ALREADY_VOIDED',
          severity: 'error',
          message: 'Hardware unit warranty has been revoked/voided by manufacturer.'
        });
      } else if (unit.status === 'unclaimed') {
        reasons.push({
          code: 'REV_CLAIM_UNIT_NOT_YET_REGISTERED',
          severity: 'warning',
          message: 'Serial exists in inventory but has not been registered/claimed by customer yet.'
        });
      }

      // ───────────────────────────────────────────────────────────────────────
      // CHECK 1B: Official Release Check — Was the product really released?
      // ───────────────────────────────────────────────────────────────────────
      if (!unit.blockchainAnchored) {
        reasons.push({
          code: 'ERR_CLAIM_UNIT_NOT_RELEASED',
          severity: 'error',
          message: `Serial ${serial} exists in catalog but has NOT been anchored on-chain. Product was never officially released by supplier.`
        });
      } else {
        reasons.push({
          code: 'PASS_CLAIM_UNIT_BLOCKCHAIN_ANCHORED',
          severity: 'info',
          message: `Serial ${serial} is anchored on-chain via Merkle batch ${unit.importBatchId || 'N/A'}. Product officially released.`
        });
      }

      // ───────────────────────────────────────────────────────────────────────
      // CHECK 1C: Product ID / Brand Matching
      // ───────────────────────────────────────────────────────────────────────
      const claimedProductId = String(ticket.productId || '').trim().toLowerCase();
      const supplierProductId = String(unit.productId || '').trim().toLowerCase();
      const claimedBrand = String(ticket.brand || '').trim().toLowerCase();
      const supplierBrand = String(unit.brand || '').trim().toLowerCase();

      if (claimedProductId && supplierProductId && claimedProductId !== supplierProductId) {
        reasons.push({
          code: 'REV_CLAIM_PRODUCT_ID_MISMATCH',
          severity: 'warning',
          message: `Claim product ID "${ticket.productId}" does not match supplier ledger product ID "${unit.productId}" for serial ${serial}.`
        });
      }

      if (claimedBrand && supplierBrand && claimedBrand !== supplierBrand) {
        reasons.push({
          code: 'ERR_CLAIM_BRAND_MISMATCH',
          severity: 'error',
          message: `Claim submitted to brand "${ticket.brand}" but serial ${serial} belongs to brand "${unit.brand}" in supplier catalog.`
        });
      }

      // ───────────────────────────────────────────────────────────────────────
      // CHECK 2: Deterministic Warranty Window & Expiry
      // ───────────────────────────────────────────────────────────────────────
      const claimDate = ticket.claimDate ? new Date(ticket.claimDate) : new Date();
      if (unit.activatedWarrantyExpiry) {
        if (claimDate > unit.activatedWarrantyExpiry) {
          // Unambiguous deterministic rejection: claim submitted past expiration
          reasons.push({
            code: 'ERR_WARRANTY_EXPIRED',
            severity: 'error',
            message: `Warranty expired on ${unit.activatedWarrantyExpiry.toISOString().slice(0, 10)}. Claim submitted on ${claimDate.toISOString().slice(0, 10)}.`
          });
        } else {
          const daysLeft = Math.ceil((unit.activatedWarrantyExpiry.getTime() - claimDate.getTime()) / 86400000);
          reasons.push({
            code: 'INFO_WARRANTY_ACTIVE',
            severity: 'info',
            message: `Active warranty verified. ${daysLeft} days remaining in coverage term.`
          });
          ticket.remainingWarrantyDaysTransferred = daysLeft;
        }
      } else if (unit.warrantyDurationMonths) {
        reasons.push({
          code: 'REV_WARRANTY_NOT_ACTIVATED',
          severity: 'warning',
          message: `Supplier warranty period is ${unit.warrantyDurationMonths} months but warranty has not been activated yet (no expiry date set).`
        });
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CHECK 3: Duplicate Open Claims
    // ─────────────────────────────────────────────────────────────────────────
    const duplicateOpenClaims = await SupplierClaimTicket.find({
      supplierWalletAddress: normalizedAddress,
      manufacturerSerialNumber: serial,
      ticketId: { $ne: ticket.ticketId },
      validationState: { $in: ['pending', 'needs_review', 'auto_passed', 'manually_approved'] }
    });

    if (duplicateOpenClaims.length > 0) {
      reasons.push({
        code: 'REV_DUPLICATE_OPEN_CLAIM_EXISTS',
        severity: 'warning',
        message: `Active claim ${duplicateOpenClaims[0].ticketId} is already open for this hardware serial. Potential duplicate submission.`
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CHECK 4: Subjective Evidence & Damage Policy Assessment
    // ─────────────────────────────────────────────────────────────────────────
    const evidence = ticket.diagnosticEvidence || {};

    if (ticket.issueCategory === 'physical_damage' || ticket.issueCategory === 'liquid_damage' || evidence.isAccidentalDamageReported) {
      // Accidental/liquid damage is standard policy exclusion - requires physical depot inspection
      reasons.push({
        code: 'REV_EXCLUDED_PERIL_INSPECTION_REQUIRED',
        severity: 'warning',
        message: 'Physical impact or liquid ingress reported. Policy excludes non-manufacturing defects; depot bench inspection required.'
      });
    } else if (evidence.hasDiagnosticLog && evidence.diagnosticConfidence >= 90) {
      reasons.push({
        code: 'PASS_DIAGNOSTIC_FAILURE_VERIFIED',
        severity: 'info',
        message: `Authorized hardware diagnostic code '${evidence.diagnosticCode}' confirms component failure with ${evidence.diagnosticConfidence}% confidence.`
      });
    } else if (!evidence.hasDiagnosticLog) {
      reasons.push({
        code: 'REV_DIAGNOSTIC_LOG_ABSENT',
        severity: 'warning',
        message: 'No digital diagnostic telemetry provided with claim. Technician review needed.'
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CHECK 5: Replacement Unit Linkage & Warranty Transfer Policy
    // ─────────────────────────────────────────────────────────────────────────
    if (ticket.claimType === 'replacement' && unit && unit.status === 'registered') {
      // Find eligible unclaimed replacement unit of same model
      const replacementCandidate = await SupplierInventory.findOne({
        supplierWalletAddress: normalizedAddress,
        modelNumber: unit.modelNumber,
        status: 'unclaimed',
        blockchainAnchored: true
      });

      if (replacementCandidate) {
        ticket.replacementUnitSerial = replacementCandidate.manufacturerSerialNumber;
        reasons.push({
          code: 'INFO_REPLACEMENT_UNIT_ASSIGNED',
          severity: 'info',
          message: `Assigned replacement unit ${replacementCandidate.manufacturerSerialNumber}. Remaining ${ticket.remainingWarrantyDaysTransferred} days warranty will transfer upon confirmation.`
        });
      } else {
        reasons.push({
          code: 'REV_NO_REPLACEMENT_INVENTORY_AVAILABLE',
          severity: 'warning',
          message: `No unclaimed replacement units in stock for model ${unit.modelNumber}. Escalated to procurement review.`
        });
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BUILD CLAIM INVENTORY COMPARISON MATRIX (for Audit Modal UI)
    // ─────────────────────────────────────────────────────────────────────────
    let inventoryComparison = null;
    if (unit) {
      const claimedProductId = String(ticket.productId || '').trim().toLowerCase();
      const supplierProductId = String(unit.productId || '').trim().toLowerCase();
      const claimedBrand = String(ticket.brand || '').trim().toLowerCase();
      const supplierBrand = String(unit.brand || '').trim().toLowerCase();

      inventoryComparison = {
        serialNumberMatch: {
          match: true,
          claimed: serial,
          supplier: unit.manufacturerSerialNumber
        },
        productIdMatch: {
          match: !claimedProductId || !supplierProductId || claimedProductId === supplierProductId,
          claimed: ticket.productId || 'N/A',
          supplier: unit.productId || 'N/A'
        },
        productNameMatch: {
          match: true,
          claimed: ticket.productName || 'N/A',
          supplier: unit.productName || 'N/A'
        },
        brandMatch: {
          match: !claimedBrand || !supplierBrand || claimedBrand === supplierBrand,
          claimed: ticket.brand || 'N/A',
          supplier: unit.brand || 'N/A'
        },
        modelMatch: {
          match: true,
          claimed: unit.modelNumber || 'N/A',
          supplier: unit.modelNumber || 'N/A'
        },
        releaseStatus: {
          isAnchoredOnChain: unit.blockchainAnchored || false,
          importBatchId: unit.importBatchId || null,
          blockchainTxHash: unit.blockchainTxHash || null,
          receivedReleaseDate: unit.receivedDate ? unit.receivedDate.toISOString().slice(0, 10) : null
        },
        warrantyInfo: {
          supplierWarrantyMonths: unit.warrantyDurationMonths || null,
          supplierWarrantyStartRule: unit.warrantyStartRule || 'purchase_date',
          activatedExpiry: unit.activatedWarrantyExpiry ? unit.activatedWarrantyExpiry.toISOString().slice(0, 10) : null,
          registeredAt: unit.registeredAt ? unit.registeredAt.toISOString().slice(0, 10) : null,
          registeredByCustomer: unit.registeredByCustomer || null
        },
        inventoryStatus: unit.status,
        productId: unit.productId,
        warrantyId: unit.warrantyId || null
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SYNTHESIZE CLAIM VERDICT
    // ─────────────────────────────────────────────────────────────────────────
    const hasFatal = reasons.some((r) => r.severity === 'error');
    const hasWarnings = reasons.some((r) => r.severity === 'warning');

    if (hasFatal) {
      finalVerdict = 'auto_rejected';
    } else if (hasWarnings) {
      finalVerdict = 'needs_review';
    } else {
      finalVerdict = 'auto_passed';
      ticket.onChainReady = true;
      reasons.push({
        code: 'PASS_WARRANTY_CLAIM_APPROVED',
        severity: 'info',
        message: 'Claim satisfies all automated warranty criteria. Product officially released, warranty active, and diagnostic verified.'
      });
    }

    ticket.validationState = finalVerdict;
    ticket.reasonCodes = reasons;
    ticket.inventoryComparison = inventoryComparison;
    ticket.evaluatedAt = new Date();
    await ticket.save();

    return ticket;
  }

  /**
   * Automatically check ALL suppliers for this brand in the database,
   * search their inventories for matching hardware unit, create a
   * SupplierInvoiceSubmission, immediately execute automated validation,
   * and return the authoritative result so it appears on the supplier dashboard.
   */
  async processAndValidateCustomerRegistration({
    brand,
    productName,
    modelNumber,
    serialNumber,
    invoiceNumber,
    purchaseDate,
    customerWallet,
    customerName,
    fileName,
    fileBuffer,
    fileMimeType
  }) {
    const cleanBrand = String(brand || '').trim();
    if (!cleanBrand) {
      throw Object.assign(new Error('Brand is required for supplier verification.'), { status: 400 });
    }

    const brandRegex = new RegExp(escapeRegExp(cleanBrand), 'i');

    // 1. Find all suppliers registered in the database for this brand
    const supplierUsers = await User.find({
      role: 'supplier',
      $or: [
        { 'supplierProfile.brandName': { $regex: brandRegex } },
        { 'supplierProfile.authorizedBrands': { $regex: brandRegex } },
        { 'supplierProfile.companyName': { $regex: brandRegex } },
        { name: { $regex: brandRegex } }
      ]
    }).lean();

    const invSupplierWallets = await SupplierInventory.distinct('supplierWalletAddress', {
      brand: { $regex: brandRegex }
    });

    const allSupplierWallets = Array.from(new Set([
      ...supplierUsers.map((u) => u.walletAddress.toLowerCase()),
      ...invSupplierWallets.map((w) => w.toLowerCase())
    ]));

    if (allSupplierWallets.length === 0) {
      const isApple = cleanBrand === 'apple';
      const isTestMode = Boolean(process.env.CHECKWARRANTY_API_KEY && process.env.CHECKWARRANTY_API_KEY.startsWith('cw_test_'));
      const isTestSerial = serialNumber && String(serialNumber).trim().toUpperCase().startsWith('TEST-');

      // Apple products go directly to Apple supplier ledger.
      // In test mode, only check CheckWarranty API if serial is a test fixture (TEST-*).
      if (!isApple && serialNumber && (await checkWarrantyProvider.supportsBrand(cleanBrand)) && (!isTestMode || isTestSerial)) {
        try {
          const checkRes = await checkWarrantyProvider.lookupDevice({
            brand: cleanBrand,
            serialNumber: String(serialNumber).trim()
          });

          if (checkRes.success && (checkRes.status === 'VERIFIED' || checkRes.status === 'EXPIRED')) {
            return {
              success: true,
              valid: true,
              validationState: 'auto_passed',
              verificationSource: 'checkwarranty',
              verificationProvider: `${cleanBrand} Official Manufacturer Database`,
              matchedSerial: String(serialNumber).trim(),
              matchedUnit: null,
              warrantyDetails: checkRes.warranty,
              device: checkRes.device,
              reasonCodes: [
                {
                  code: 'PASS_CHECKWARRANTY_OEM_VERIFIED',
                  severity: 'info',
                  message: `Hardware unit verified directly via ${cleanBrand} OEM manufacturer records (${checkRes.device?.model || cleanBrand}). Warranty: ${checkRes.warranty?.coverageType || 'Manufacturer Warranty'}.`
                }
              ],
              message: `Verified via ${cleanBrand} OEM database: ${checkRes.device?.model || cleanBrand} (${checkRes.warranty?.coverageType || 'Manufacturer Standard Warranty'})`
            };
          }
        } catch (cwErr) {
          console.warn('CheckWarranty fallback lookup error:', cwErr.message);
        }
      }

      return {
        success: false,
        valid: false,
        validationState: 'auto_rejected',
        message: `No authorized supplier found in the network for brand "${cleanBrand}". Registration requires verified supplier inventory.`
      };
    }

    // 1B. Check if this product serial is already registered in BlockWarranty by another customer
    if (serialNumber) {
      const sClean = String(serialNumber).trim();
      const sRegex = new RegExp(`^${escapeRegExp(sClean)}$`, 'i');
      const existingProduct = await Product.findOne({
        serialNumber: { $regex: sRegex }
      }).lean();

      if (
        existingProduct &&
        existingProduct.walletAddress.toLowerCase() !== String(customerWallet || '').toLowerCase()
      ) {
        let ownerName = '';
        try {
          const regUser = await User.findOne({
            walletAddress: existingProduct.walletAddress.toLowerCase()
          }).lean();
          if (regUser && regUser.name && regUser.name.trim().toLowerCase() !== 'retail customer') {
            ownerName = regUser.name.trim();
          }
        } catch (_) {}

        const ownerDisplay = ownerName
          ? `under "${ownerName}"`
          : `to another registered owner (${existingProduct.walletAddress.slice(0, 6)}…${existingProduct.walletAddress.slice(-4)})`;

        const professionalMsg = `Sorry, this product (Serial: ${sClean}) is already registered ${ownerDisplay}. If you recently purchased this item second-hand, please request the previous owner to transfer ownership to your wallet via BlockWarranty.`;

        return {
          success: false,
          valid: false,
          validationState: 'auto_rejected',
          message: professionalMsg,
          reasonCodes: [
            {
              code: 'ERR_UNIT_ALREADY_REGISTERED_OTHER_CUSTOMER',
              severity: 'error',
              message: professionalMsg
            }
          ]
        };
      }
    }

    // 2. Search across ALL matching suppliers' inventories for this hardware unit
    let matchedUnit = null;
    let targetSupplierWallet = allSupplierWallets[0];

    // Priority A: Search by serial number if provided
    if (serialNumber) {
      const sRegex = new RegExp(`^${escapeRegExp(String(serialNumber).trim())}$`, 'i');
      matchedUnit = await SupplierInventory.findOne({
        supplierWalletAddress: { $in: allSupplierWallets },
        manufacturerSerialNumber: { $regex: sRegex }
      });
    }

    // Priority B: Search by invoice number in variant, serial, PO, or shipment reference
    if (!matchedUnit && invoiceNumber) {
      const cleanInv = String(invoiceNumber).trim();
      const invPattern = escapeRegExp(cleanInv).replace(/[0O]/g, '[0O]');
      const invRegex = new RegExp(invPattern, 'i');
      matchedUnit = await SupplierInventory.findOne({
        supplierWalletAddress: { $in: allSupplierWallets },
        $or: [
          { manufacturerSerialNumber: { $regex: invRegex } },
          { variant: { $regex: invRegex } },
          { purchaseOrderNumber: { $regex: invRegex } },
          { shipmentReference: { $regex: invRegex } }
        ]
      });
    }

    // Priority C: Search by product name in unclaimed inventory
    if (!matchedUnit && productName) {
      const simplified = productName.replace(/^(apple|samsung|sony|dell|hp)\s+/i, '').split('(')[0].trim();
      if (simplified.length > 2) {
        matchedUnit = await SupplierInventory.findOne({
          supplierWalletAddress: { $in: allSupplierWallets },
          brand: { $regex: brandRegex },
          productName: { $regex: new RegExp(escapeRegExp(simplified), 'i') },
          status: 'unclaimed'
        });
      }
    }

    if (matchedUnit) {
      targetSupplierWallet = matchedUnit.supplierWalletAddress.toLowerCase();
    }

    // 3. Create the SupplierInvoiceSubmission ticket
    const submissionId = `INV-SUB-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const fileHash = fileBuffer
      ? crypto.createHash('sha256').update(fileBuffer).digest('hex')
      : crypto.randomBytes(16).toString('hex');

    const finalSerial = matchedUnit ? matchedUnit.manufacturerSerialNumber : String(serialNumber || '').trim();
    const finalModel = matchedUnit ? matchedUnit.modelNumber : String(modelNumber || '').trim();

    let finalCustomerName = String(customerName || '').trim();
    if (!finalCustomerName || finalCustomerName.toLowerCase() === 'retail customer') {
      try {
        const u = await User.findOne({
          walletAddress: String(customerWallet || '').toLowerCase()
        }).lean();
        if (u && u.name && u.name.trim()) {
          finalCustomerName = u.name.trim();
        }
      } catch (_) {}
    }
    if (!finalCustomerName) {
      finalCustomerName = 'Retail Customer';
    }

    const submission = new SupplierInvoiceSubmission({
      submissionId,
      supplierWalletAddress: targetSupplierWallet,
      brand: cleanBrand,
      customerWallet: String(customerWallet || '').toLowerCase(),
      customerName: finalCustomerName,
      fileName: fileName || 'Invoice.pdf',
      fileHash,
      invoiceNumber: String(invoiceNumber || '').trim(),
      extractedData: {
        serialNumber: finalSerial,
        productName: productName || matchedUnit?.productName || '',
        modelNumber: finalModel,
        invoiceNumber: String(invoiceNumber || '').trim(),
        purchaseDate: purchaseDate ? new Date(purchaseDate).toISOString().slice(0, 10) : '',
        sellerName: 'Authorized Retailer',
        confidenceScore: 98,
        invoiceIssuerType: 'authorized_retailer'
      },
      validationState: 'pending'
    });

    await submission.save();

    // 4. Immediately execute automated evaluation (no button click needed)
    const evaluated = await this.evaluateInvoiceSubmission(submissionId, targetSupplierWallet);

    const isAutoPassed = evaluated.validationState === 'auto_passed';
    const fatalErrors = (evaluated.reasonCodes || []).filter((r) => r.severity === 'error').map((r) => r.message);
    const warnings = (evaluated.reasonCodes || []).filter((r) => r.severity === 'warning').map((r) => r.message);

    return {
      success: isAutoPassed,
      valid: isAutoPassed,
      validationState: evaluated.validationState,
      submissionId: evaluated.submissionId,
      supplierWallet: targetSupplierWallet,
      matchedSerial: matchedUnit ? matchedUnit.manufacturerSerialNumber : finalSerial,
      matchedUnit,
      reasonCodes: evaluated.reasonCodes,
      inventoryComparison: evaluated.inventoryComparison,
      message: isAutoPassed
        ? 'Invoice verified and validated by supplier automated engine.'
        : fatalErrors.length > 0
          ? (fatalErrors[0].startsWith('Sorry,') ? fatalErrors.join('; ') : `Supplier automated verification failed: ${fatalErrors.join('; ')}`)
          : `Supplier review required: ${warnings.join('; ')}`
    };
  }
}

module.exports = new SupplierVerificationService();
