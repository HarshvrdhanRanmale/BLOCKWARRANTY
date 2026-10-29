const crypto = require('crypto');
const config = require('../../config/env');

/**
 * CheckWarranty B2B Public API Provider Client
 * Reference documentation: https://checkwarranty.info/api/docs
 *
 * Implements hardware manufacturer warranty lookups by serial number.
 * Note: CheckWarranty does NOT provide invoice/receipt authentication.
 */
class CheckWarrantyProvider {
  constructor(options = {}) {
    this.apiKey = options.apiKey !== undefined ? options.apiKey : (config.CHECKWARRANTY_API_KEY || '');
    this.baseUrl = (options.baseUrl || config.CHECKWARRANTY_BASE_URL || 'https://checkwarranty.info').replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs || 8000;
    this.brandsCache = null;
    this.brandsCacheExpiresAt = 0;
    this.cacheTtlMs = options.cacheTtlMs || 10 * 60 * 1000; // 10 minutes
  }

  /**
   * Brand normalization mapping to canonical CheckWarranty API slugs.
   * Documented enum: ['lenovo', 'hp', 'dell', 'apple']
   */
  normalizeBrand(brand) {
    if (!brand || typeof brand !== 'string') return null;
    const clean = brand.trim().toLowerCase();

    if (clean === 'apple' || clean.startsWith('apple ') || clean === 'apple inc') return 'apple';
    if (clean === 'dell' || clean.startsWith('dell ') || clean === 'alienware') return 'dell';
    if (clean === 'hp' || clean === 'hewlett-packard' || clean === 'hewlett packard') return 'hp';
    if (clean === 'lenovo' || clean.startsWith('lenovo ') || clean === 'thinkpad' || clean === 'ideapad') return 'lenovo';

    return clean;
  }

  /**
   * Determine whether an API key has been configured server-side.
   */
  isConfigured() {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  /**
   * Common request helper with bounded timeout and safe error normalization.
   */
  async _request(endpoint, options = {}) {
    if (!this.isConfigured()) {
      return {
        success: false,
        provider: 'checkwarranty',
        status: 'CONFIG_ERROR',
        code: 'MISSING_API_KEY',
        isEligibleForFallback: true,
        message: 'CheckWarranty API key is not configured in server environment.'
      };
    }

    const url = `${this.baseUrl}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
      Authorization: `Bearer ${this.apiKey}`,
      ...(options.headers || {})
    };

    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type') || '';
      let data = null;
      if (contentType.includes('json')) {
        try {
          data = await response.json();
        } catch (_) {
          data = null;
        }
      } else {
        const textData = await response.text();
        try {
          data = JSON.parse(textData);
        } catch (_) {
          data = { rawText: textData };
        }
      }

      if (response.ok) {
        return {
          success: true,
          httpStatus: response.status,
          data
        };
      }

      // Handle RFC 7807 Problem Details and specific HTTP error codes
      return this._normalizeErrorResponse(response.status, data);
    } catch (err) {
      clearTimeout(timeoutId);

      const isTimeout = err.name === 'AbortError' || err.code === 'ETIMEDOUT';
      return {
        success: false,
        provider: 'checkwarranty',
        status: 'PROVIDER_UNAVAILABLE',
        code: isTimeout ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
        isEligibleForFallback: true,
        message: isTimeout
          ? `CheckWarranty request timed out after ${this.timeoutMs}ms.`
          : `Network error connecting to CheckWarranty: ${err.message}`
      };
    }
  }

  /**
   * Map HTTP error codes and RFC 7807 Problem Details to standard status taxonomy.
   */
  _normalizeErrorResponse(statusCode, data) {
    const detail = data?.detail || data?.message || data?.title || 'Unknown provider error';
    const errorCode = data?.error || (data?.errors && data.errors[0]?.code) || null;

    let status = 'PROVIDER_UNAVAILABLE';
    let code = 'HTTP_' + statusCode;

    switch (statusCode) {
      case 400:
        status = 'NEEDS_CORRECTION';
        code = 'BAD_REQUEST';
        break;
      case 401:
        status = 'AUTH_FAILED';
        code = 'UNAUTHORIZED';
        break;
      case 402:
        status = 'PROVIDER_UNAVAILABLE';
        code = 'INSUFFICIENT_CREDITS';
        break;
      case 403:
        status = 'AUTH_FAILED';
        code = 'FORBIDDEN_IP';
        break;
      case 404:
        status = 'NOT_FOUND';
        code = 'DEVICE_NOT_FOUND';
        break;
      case 409:
        status = 'PROVIDER_UNAVAILABLE';
        code = 'IDEMPOTENCY_CONFLICT';
        break;
      case 422:
        status = 'NEEDS_CORRECTION';
        code = errorCode || 'UNPROCESSABLE_INPUT';
        break;
      case 429:
        status = 'RATE_LIMITED';
        code = 'TOO_MANY_REQUESTS';
        break;
      case 503:
      default:
        status = 'PROVIDER_UNAVAILABLE';
        code = 'SERVICE_UNAVAILABLE';
        break;
    }

    return {
      success: false,
      provider: 'checkwarranty',
      httpStatus: statusCode,
      status,
      code,
      isEligibleForFallback: true,
      message: detail,
      problemDetails: data || null
    };
  }

  /**
   * Operation: GET /api/v1/devices/brands
   * Discover list of supported manufacturer brands and formatting patterns.
   */
  async getBrands(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && this.brandsCache && now < this.brandsCacheExpiresAt) {
      return { success: true, brands: this.brandsCache, cached: true };
    }

    const res = await this._request('/api/v1/devices/brands', { method: 'GET' });
    if (!res.success) {
      return res;
    }

    const brands = Array.isArray(res.data?.brands) ? res.data.brands : [];
    this.brandsCache = brands;
    this.brandsCacheExpiresAt = now + this.cacheTtlMs;

    return {
      success: true,
      provider: 'checkwarranty',
      brands,
      cached: false
    };
  }

  /**
   * Check whether CheckWarranty supports the given brand for device lookup.
   */
  async supportsBrand(brand) {
    const normalized = this.normalizeBrand(brand);
    if (!normalized) return false;

    // Hardcoded known enum per CheckWarranty OpenAPI specification
    const defaultSupported = ['lenovo', 'hp', 'dell', 'apple'];
    if (defaultSupported.includes(normalized)) return true;

    // If cache available, inspect dynamic registry
    if (this.brandsCache && Array.isArray(this.brandsCache)) {
      return this.brandsCache.some(b => (b.brand || b.id || '').toLowerCase() === normalized);
    }

    return false;
  }

  /**
   * Operation: POST /api/v1/devices/lookup
   * Synchronous single device warranty lookup with brand and serial number.
   *
   * @param {Object} params
   * @param {string} params.brand Hardware manufacturer brand ('apple', 'dell', 'hp', 'lenovo')
   * @param {string} params.serialNumber Device serial number
   * @param {string} [params.pn] Product Number (required for some HP models)
   * @param {boolean} [params.forceRefresh] Force query live vendor servers
   * @param {string} [params.idempotencyKey] Optional unique key; auto-generated if omitted
   */
  async lookupDevice({ brand, serialNumber, pn, forceRefresh = false, idempotencyKey = null }) {
    if (!serialNumber || typeof serialNumber !== 'string' || !serialNumber.trim()) {
      return {
        success: false,
        provider: 'checkwarranty',
        status: 'NEEDS_CORRECTION',
        code: 'MISSING_SERIAL',
        isEligibleForFallback: true,
        message: 'Serial number is required for CheckWarranty lookup.'
      };
    }

    const normalizedBrand = this.normalizeBrand(brand);
    const isSupported = await this.supportsBrand(normalizedBrand);

    if (!isSupported) {
      return {
        success: false,
        provider: 'checkwarranty',
        status: 'UNSUPPORTED',
        code: 'BRAND_NOT_SUPPORTED',
        brand: brand || '',
        normalizedBrand,
        isEligibleForFallback: true,
        message: `Brand "${brand}" is not supported by CheckWarranty device lookup.`
      };
    }

    const key = idempotencyKey || crypto.randomUUID();
    const payload = {
      brand: normalizedBrand,
      serialNumber: serialNumber.trim(),
      forceRefresh: Boolean(forceRefresh)
    };
    if (pn && typeof pn === 'string' && pn.trim()) {
      payload.pn = pn.trim();
    }

    const res = await this._request('/api/v1/devices/lookup', {
      method: 'POST',
      headers: {
        'idempotency-key': key
      },
      body: payload
    });

    if (!res.success) {
      return {
        ...res,
        brand: normalizedBrand,
        serialNumber: serialNumber.trim()
      };
    }

    return this._normalizeLookupSuccess(res.data, normalizedBrand, serialNumber.trim());
  }

  /**
   * Operation: POST /api/v1/devices/auto-detect
   * Synchronous lookup with automatic brand detection.
   */
  async autoDetectDevice({ serialNumber, candidates = null, pn = null, forceRefresh = false, idempotencyKey = null }) {
    if (!serialNumber || typeof serialNumber !== 'string' || !serialNumber.trim()) {
      return {
        success: false,
        provider: 'checkwarranty',
        status: 'NEEDS_CORRECTION',
        code: 'MISSING_SERIAL',
        isEligibleForFallback: true,
        message: 'Serial number is required for auto-detect lookup.'
      };
    }

    const key = idempotencyKey || crypto.randomUUID();
    const payload = {
      serialNumber: serialNumber.trim(),
      forceRefresh: Boolean(forceRefresh)
    };
    if (pn && typeof pn === 'string' && pn.trim()) {
      payload.pn = pn.trim();
    }
    if (Array.isArray(candidates) && candidates.length > 0) {
      payload.candidates = candidates.map(c => this.normalizeBrand(c)).filter(Boolean);
    }

    const res = await this._request('/api/v1/devices/auto-detect', {
      method: 'POST',
      headers: {
        'idempotency-key': key
      },
      body: payload
    });

    if (!res.success) {
      return {
        ...res,
        serialNumber: serialNumber.trim()
      };
    }

    const detectedBrand = res.data?.device?.brand || null;
    return this._normalizeLookupSuccess(res.data, detectedBrand, serialNumber.trim());
  }

  /**
   * Operation: GET /api/v1/account/balance
   * Retrieve current available scan credit balance.
   */
  async getAccountBalance() {
    const res = await this._request('/api/v1/account/balance', { method: 'GET' });
    if (!res.success) {
      return res;
    }

    return {
      success: true,
      provider: 'checkwarranty',
      balance: res.data?.balance ?? res.data?.scanBalance ?? 0,
      reservedCredits: res.data?.reservedCredits ?? 0,
      currency: res.data?.currency || 'credits',
      userId: res.data?.userId || ''
    };
  }

  /**
   * Normalize 200 SyncLookupResponseDto to unified internal format.
   */
  _normalizeLookupSuccess(data, brand, serialNumber) {
    const rawWarranty = data?.warranty || {};
    const rawDevice = data?.device || {};
    const rawQuality = data?.dataQuality || {};
    const rawCredits = data?.credits || {};

    const rawStatus = (rawWarranty.status || 'unknown').toLowerCase();

    // Map provider warranty status to internal taxonomy
    let status = 'PENDING_REVIEW';
    let isEligibleForFallback = false;

    if (rawStatus === 'active') {
      status = 'VERIFIED';
    } else if (rawStatus === 'expired') {
      status = 'EXPIRED';
    } else if (rawStatus === 'not_found') {
      status = 'NOT_FOUND';
      isEligibleForFallback = true;
    } else {
      status = 'UNVERIFIED';
      isEligibleForFallback = true;
    }

    return {
      success: true,
      provider: 'checkwarranty',
      status,
      isEligibleForFallback,
      brand: rawDevice.brand || brand,
      serialNumber: rawDevice.serialNumber || serialNumber,
      device: {
        brand: rawDevice.brand || brand,
        model: rawDevice.model || '',
        serialNumber: rawDevice.serialNumber || serialNumber,
        productNumber: rawDevice.productNumber || '',
        manufactureDate: rawDevice.manufactureDate || null,
        description: rawDevice.description || ''
      },
      warranty: {
        status: rawStatus,
        startDate: rawWarranty.startDate || null,
        startDateSource: rawWarranty.startDateSource || null,
        durationMonths: rawWarranty.warrantyDurationMonths || null,
        endDate: rawWarranty.endDate || null,
        coverageType: rawWarranty.coverageType || 'Manufacturer Standard Warranty',
        details: rawWarranty.details || {}
      },
      dataQuality: {
        source: rawQuality.source || 'official_vendor_api',
        confidence: rawQuality.confidence || 100,
        freshness: rawQuality.freshness || 'live'
      },
      credits: {
        charged: rawCredits.charged ?? 1,
        remaining: rawCredits.remaining ?? null
      },
      batchId: data?.batchId || null,
      message: data?.message || 'Warranty details retrieved successfully from manufacturer.'
    };
  }
}

module.exports = new CheckWarrantyProvider();
module.exports.CheckWarrantyProvider = CheckWarrantyProvider;
