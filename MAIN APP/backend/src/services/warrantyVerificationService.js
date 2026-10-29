const checkWarrantyProvider = require('./warrantyProviders/checkWarrantyProvider');
const supplierVerificationService = require('./supplierVerificationService');
const SupplierInventory = require('../models/SupplierInventory');
const User = require('../models/User');
const Product = require('../models/Product');

const escapeRegExp = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Centralized Warranty Verification Orchestrator for BlockWarranty
 *
 * Implements the multi-tiered verification hierarchy:
 * Priority 1: CheckWarranty API (Manufacturer aggregator verification)
 * Priority 2: Existing Supplier Database (Authorized brand supplier inventory ledger fallback)
 * Priority 3: Manual Review / Pending status
 *
 * Important: Invoice verification is kept completely separate and handled
 * by the existing supplier inventory & OCR document verification engine.
 */
class WarrantyVerificationService {
  constructor(provider = checkWarrantyProvider) {
    this.provider = provider;
  }

  /**
   * Normalize brand string for consistent provider and database querying.
   */
  normalizeBrand(brand) {
    return this.provider.normalizeBrand(brand);
  }

  /**
   * Execute multi-tiered warranty verification for a product / device.
   *
   * @param {Object} params
   * @param {string} params.brand Hardware manufacturer brand (e.g. 'Apple', 'Dell', 'HP', 'Lenovo')
   * @param {string} params.serialNumber Device serial number
   * @param {string} [params.modelNumber] Device model or product number
   * @param {string} [params.pn] Product Number (e.g. for HP)
   * @param {string} [params.productId] Optional BlockWarranty product ID to attach result
   * @param {string} [params.customerWallet] Optional customer wallet address
   * @param {boolean} [params.forceRefresh] Force refresh vendor cache
   */
  async verifyWarranty({
    brand,
    serialNumber,
    modelNumber = '',
    pn = '',
    productId = '',
    customerWallet = '',
    forceRefresh = false
  }) {
    const rawBrand = String(brand || '').trim();
    const cleanSerial = String(serialNumber || '').trim();
    const effectivePn = String(pn || modelNumber || '').trim();
    const attempts = [];
    const timestamp = new Date();

    if (!cleanSerial) {
      return {
        success: false,
        verificationStatus: 'NEEDS_CORRECTION',
        verificationSource: 'manual',
        verificationProvider: 'None',
        brand: rawBrand,
        serialNumber: '',
        message: 'A valid device serial number is required for warranty verification.',
        attempts: []
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PRIORITY 1: CheckWarranty External Aggregator API
    // ─────────────────────────────────────────────────────────────────────────
    let primaryResult = null;
    let providerAttempted = false;

    const normalizedBrand = this.normalizeBrand(rawBrand);
    const isBrandSupported = await this.provider.supportsBrand(normalizedBrand);
    const isApple = normalizedBrand === 'apple';
    const isTestMode = Boolean(this.provider.apiKey && this.provider.apiKey.startsWith('cw_test_'));
    const isTestSerial = cleanSerial.toUpperCase().startsWith('TEST-');

    // Apple products go directly to Apple supplier ledger.
    // In test mode, only query CheckWarranty if serial is a test fixture (TEST-*).
    if (!isApple && this.provider.isConfigured() && isBrandSupported && (!isTestMode || isTestSerial)) {
      providerAttempted = true;
      try {
        primaryResult = await this.provider.lookupDevice({
          brand: normalizedBrand,
          serialNumber: cleanSerial,
          pn: effectivePn || undefined,
          forceRefresh
        });

        attempts.push({
          source: 'checkwarranty',
          endpoint: '/api/v1/devices/lookup',
          brand: normalizedBrand,
          status: primaryResult.status,
          success: primaryResult.success,
          httpStatus: primaryResult.httpStatus || 200,
          timestamp: new Date()
        });

        // If CheckWarranty definitively verifies active coverage or confirmed expiration:
        if (primaryResult.success && (primaryResult.status === 'VERIFIED' || primaryResult.status === 'EXPIRED')) {
          const outcome = {
            success: true,
            verificationStatus: primaryResult.status, // 'VERIFIED' | 'EXPIRED'
            verificationSource: 'checkwarranty',
            verificationProvider: `${primaryResult.brand || rawBrand} Official Manufacturer Database`,
            verifiedAt: timestamp,
            brand: primaryResult.brand || rawBrand,
            serialNumber: cleanSerial,
            externalReferenceId: primaryResult.batchId || '',
            warrantyDetails: primaryResult.warranty,
            deviceDetails: primaryResult.device,
            dataQuality: primaryResult.dataQuality,
            supplierFallbackUsed: false,
            message: primaryResult.status === 'VERIFIED'
              ? `Warranty verified active by ${primaryResult.brand || rawBrand} manufacturer records (${primaryResult.warranty.coverageType || 'Standard'}).`
              : `${primaryResult.brand || rawBrand} manufacturer records confirm warranty expired on ${primaryResult.warranty.endDate || 'past date'}.`,
            attempts
          };

          if (productId) {
            await this._persistProductVerification(productId, outcome);
          }
          return outcome;
        }
      } catch (err) {
        attempts.push({
          source: 'checkwarranty',
          endpoint: '/api/v1/devices/lookup',
          status: 'PROVIDER_UNAVAILABLE',
          success: false,
          error: err.message,
          timestamp: new Date()
        });
      }
    } else {
      attempts.push({
        source: 'checkwarranty',
        status: !this.provider.isConfigured() ? 'CONFIG_ERROR' : 'UNSUPPORTED',
        success: false,
        message: !this.provider.isConfigured()
          ? 'CheckWarranty API key not configured; proceeding to supplier database fallback.'
          : `Brand "${rawBrand}" is not currently in the CheckWarranty supported manufacturer registry.`,
        timestamp: new Date()
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PRIORITY 2: Existing Supplier Database & Inventory Ledger Fallback
    // ─────────────────────────────────────────────────────────────────────────
    const fallbackReason = primaryResult
      ? `CheckWarranty returned ${primaryResult.status}: ${primaryResult.message || primaryResult.code}`
      : (!this.provider.isConfigured() ? 'CheckWarranty API key missing' : `Brand ${rawBrand} unsupported by CheckWarranty`);

    const supplierOutcome = await this._verifyAgainstSupplierInventory({
      rawBrand,
      normalizedBrand,
      serialNumber: cleanSerial,
      modelNumber: effectivePn,
      customerWallet
    });

    attempts.push({
      source: 'supplier',
      status: supplierOutcome.status,
      success: supplierOutcome.success,
      matchedSupplier: supplierOutcome.supplierWallet || null,
      timestamp: new Date()
    });

    if (supplierOutcome.success && supplierOutcome.status === 'VERIFIED') {
      const outcome = {
        success: true,
        verificationStatus: 'VERIFIED',
        verificationSource: 'supplier',
        verificationProvider: 'Supplier Inventory Ledger',
        verifiedAt: timestamp,
        brand: rawBrand,
        serialNumber: cleanSerial,
        externalReferenceId: supplierOutcome.matchedUnit?._id ? String(supplierOutcome.matchedUnit._id) : '',
        supplierWalletAddress: supplierOutcome.supplierWallet,
        supplierName: supplierOutcome.supplierName || 'Authorized Supplier',
        inventoryUnit: supplierOutcome.matchedUnit,
        warrantyDetails: supplierOutcome.warrantyDetails,
        supplierFallbackUsed: true,
        fallbackReason,
        message: `Verified against authorized supplier inventory (${supplierOutcome.supplierName || 'Authorized Supplier'}).`,
        attempts
      };

      if (productId) {
        await this._persistProductVerification(productId, outcome);
      }
      return outcome;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PRIORITY 3: Manual Review / Unverified
    // ─────────────────────────────────────────────────────────────────────────
    const finalStatus = (primaryResult && primaryResult.status === 'NOT_FOUND') ? 'NOT_FOUND' : 'PENDING_REVIEW';
    const finalOutcome = {
      success: false,
      verificationStatus: finalStatus,
      verificationSource: 'manual',
      verificationProvider: 'None',
      verifiedAt: null,
      brand: rawBrand,
      serialNumber: cleanSerial,
      supplierFallbackUsed: true,
      fallbackReason,
      message: finalStatus === 'NOT_FOUND'
        ? `Product serial "${cleanSerial}" not found in manufacturer records or authorized supplier inventory.`
        : `Could not automatically verify warranty for "${rawBrand}" (${cleanSerial}). Queued for manual supplier audit.`,
      attempts
    };

    if (productId) {
      await this._persistProductVerification(productId, finalOutcome);
    }
    return finalOutcome;
  }

  /**
   * Internal Supplier Inventory cross-verification fallback.
   */
  async _verifyAgainstSupplierInventory({ rawBrand, normalizedBrand, serialNumber, modelNumber, customerWallet }) {
    try {
      const cleanBrand = rawBrand || normalizedBrand || '';
      const brandRegex = new RegExp(`^${escapeRegExp(cleanBrand)}$`, 'i');

      // 1. Find all active suppliers authorized for this brand
      const suppliers = await User.find({
        role: 'supplier',
        $or: [
          { 'supplierProfile.authorizedBrands': { $regex: brandRegex } },
          { 'supplierProfile.companyName': { $regex: brandRegex } },
          { 'supplierProfile.brand': { $regex: brandRegex } }
        ]
      }, 'walletAddress name email supplierProfile').lean();

      if (!suppliers || suppliers.length === 0) {
        return {
          success: false,
          status: 'NO_SUPPLIER_FOUND',
          message: `No authorized supplier registered in ledger for brand "${cleanBrand}".`
        };
      }

      const supplierWallets = suppliers.map(s => s.walletAddress.toLowerCase());

      // 2. Exact or tolerant serial match in supplier inventory
      const cleanSerial = serialNumber.trim();
      const serialRegex = new RegExp(`^${escapeRegExp(cleanSerial)}$`, 'i');

      // Zero vs capital 'O' OCR substitution tolerance
      const tolerantSerialStr = cleanSerial.replace(/0/g, '[0O]').replace(/O/g, '[0O]');
      const tolerantRegex = new RegExp(`^${tolerantSerialStr}$`, 'i');

      let matchedUnit = await SupplierInventory.findOne({
        supplierWalletAddress: { $in: supplierWallets },
        manufacturerSerialNumber: { $regex: serialRegex }
      }).lean();

      if (!matchedUnit) {
        matchedUnit = await SupplierInventory.findOne({
          supplierWalletAddress: { $in: supplierWallets },
          manufacturerSerialNumber: { $regex: tolerantRegex }
        }).lean();
      }

      if (matchedUnit) {
        const supplierDoc = suppliers.find(s => s.walletAddress.toLowerCase() === matchedUnit.supplierWalletAddress.toLowerCase());
        const supplierName = supplierDoc?.supplierProfile?.companyName || supplierDoc?.name || 'Authorized Supplier';

        // Calculate warranty details from supplier inventory record
        const mfgDate = matchedUnit.manufactureDate || matchedUnit.createdAt || new Date();
        const durationMonths = matchedUnit.warrantyDurationMonths || matchedUnit.warrantyPeriodMonths || 12;
        const startDate = new Date(mfgDate);
        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + durationMonths);

        const isExpired = Date.now() > endDate.getTime();

        return {
          success: true,
          status: 'VERIFIED',
          supplierWallet: matchedUnit.supplierWalletAddress,
          supplierName,
          matchedUnit,
          warrantyDetails: {
            status: isExpired ? 'expired' : 'active',
            startDate: startDate.toISOString().slice(0, 10),
            endDate: endDate.toISOString().slice(0, 10),
            durationMonths,
            coverageType: 'Authorized Supplier Ledger Warranty',
            details: {
              batchNumber: matchedUnit.batchNumber || null,
              modelNumber: matchedUnit.modelNumber || modelNumber || null
            }
          }
        };
      }

      return {
        success: false,
        status: 'INSUFFICIENT_EVIDENCE',
        message: `Serial number "${cleanSerial}" not found in authorized supplier inventory ledger.`
      };
    } catch (err) {
      return {
        success: false,
        status: 'SUPPLIER_LOOKUP_ERROR',
        message: `Supplier database fallback error: ${err.message}`
      };
    }
  }

  /**
   * INVOICE VERIFICATION — SEPARATE FROM WARRANTY LOOKUP
   *
   * Reuses the existing Supplier OCR and Document Verification Service.
   * CheckWarranty does NOT perform invoice verification.
   */
  async verifyInvoice(invoiceData) {
    return supplierVerificationService.processAndValidateCustomerRegistration(invoiceData);
  }

  /**
   * Persist verification outcome on Product document in database.
   */
  async _persistProductVerification(productId, outcome) {
    try {
      await Product.updateOne(
        { productId },
        {
          $set: {
            verificationSource: outcome.verificationSource,
            verificationProvider: outcome.verificationProvider,
            verificationStatus: outcome.verificationStatus,
            externalReferenceId: outcome.externalReferenceId || '',
            verifiedAt: outcome.verifiedAt || new Date(),
            warrantyDetails: outcome.warrantyDetails || null,
            ...(outcome.supplierWalletAddress ? { supplierWalletAddress: outcome.supplierWalletAddress } : {})
          }
        }
      );
    } catch (err) {
      console.warn(`Could not persist verification fields on product ${productId}:`, err.message);
    }
  }
}

module.exports = new WarrantyVerificationService();
module.exports.WarrantyVerificationService = WarrantyVerificationService;
