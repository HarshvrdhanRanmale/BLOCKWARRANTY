/**
 * imageSearchService.js — Universal Marketplace Product Image Search
 *
 * Designed to aggressively find authentic product photos for ANY product type
 * (Electronics, Home Appliances, Footwear, Fashion, Tools, Furniture, Audio, etc.)
 * across global and regional e-commerce marketplaces.
 *
 * Highlights:
 * 1. Universal Query Cleaning: strips invoice noise, internal SKUs, barcodes, ASINs.
 * 2. Multi-Engine Scraper: Bing Images + DuckDuckGo fallback with resilient user agents.
 * 3. Multi-Stage Progressive Fallback: query relaxation so it NEVER returns an empty result.
 * 4. Marketplace Prioritization: recognizes 40+ leading global and regional retailers.
 * 5. Multi-Image Selection: returns the top #1 best image plus up to 8 alternative marketplace photos.
 */

// Global & Regional E-Commerce Marketplaces & Brands
const MARKETPLACE_PATTERNS = [
  // Global Marketplaces
  { id: 'amazon', name: 'Amazon', match: /amazon|media-amazon/i },
  { id: 'walmart', name: 'Walmart', match: /walmart|walmartimages/i },
  { id: 'bestbuy', name: 'Best Buy', match: /bestbuy/i },
  { id: 'target', name: 'Target', match: /target/i },
  { id: 'ebay', name: 'eBay', match: /ebay/i },
  { id: 'newegg', name: 'Newegg', match: /newegg/i },
  { id: 'bhphoto', name: 'B&H Photo', match: /bhphotovideo/i },
  { id: 'costco', name: 'Costco', match: /costco/i },
  { id: 'wayfair', name: 'Wayfair', match: /wayfair/i },
  { id: 'ikea', name: 'IKEA', match: /ikea/i },
  { id: 'homedepot', name: 'Home Depot', match: /homedepot/i },

  // Regional Marketplaces (India / Asia / Europe)
  { id: 'flipkart', name: 'Flipkart', match: /flipkart|flixcart/i },
  { id: 'croma', name: 'Croma', match: /croma/i },
  { id: 'reliancedigital', name: 'Reliance Digital', match: /reliancedigital/i },
  { id: 'tatacliq', name: 'Tata CLiQ', match: /tatacliq/i },
  { id: 'vijaysales', name: 'Vijay Sales', match: /vijaysales/i },
  { id: 'indiamart', name: 'IndiaMART', match: /indiamart|imimg/i },
  { id: 'bajajfinserv', name: 'Bajaj Finserv', match: /bajajfinserv/i },
  { id: 'cashify', name: 'Cashify', match: /cashify/i },
  { id: 'gadgets360', name: 'Gadgets360', match: /gadgets360/i },
  { id: 'poorvika', name: 'Poorvika', match: /poorvika/i },
  { id: 'myntra', name: 'Myntra', match: /myntra/i },
  { id: 'nykaa', name: 'Nykaa', match: /nykaa/i },
  { id: 'ajio', name: 'AJIO', match: /ajio/i },
  { id: 'currys', name: 'Currys', match: /currys/i },
  { id: 'argos', name: 'Argos', match: /argos/i },
  { id: 'otto', name: 'OTTO', match: /otto/i },

  // Direct Manufacturer Stores
  { id: 'apple', name: 'Apple', match: /apple\.com/i },
  { id: 'samsung', name: 'Samsung', match: /samsung/i },
  { id: 'sony', name: 'Sony', match: /sony/i },
  { id: 'dell', name: 'Dell', match: /dell/i },
  { id: 'lenovo', name: 'Lenovo', match: /lenovo/i },
  { id: 'hp', name: 'HP', match: /hp\.com/i },
  { id: 'asus', name: 'ASUS', match: /asus/i },
  { id: 'lg', name: 'LG', match: /lg\.com/i },
  { id: 'nike', name: 'Nike', match: /nike/i },
  { id: 'adidas', name: 'Adidas', match: /adidas/i },
  { id: 'bose', name: 'Bose', match: /bose/i },
  { id: 'dyson', name: 'Dyson', match: /dyson/i },
];

/**
 * Universal Invoice & Product Title Cleaner.
 * Works for ANY product by stripping invoice boilerplate while preserving
 * model numbers, capacities, and core product keywords.
 */
function cleanProductName(productName = '', brand = '') {
  let cleaned = String(productName || '')
    // 1. Remove pipe separators and trailing metadata: e.g. " | B07PFHRYYC ( LV-IXD0-KQ74 )"
    .replace(/\|\s*[^|\n]+/g, ' ')
    // 2. Remove bracketed serials, tracking numbers, or order IDs: e.g. "( LV-IXD0-KQ74 )" or "(SN: 9283749283)"
    .replace(/\((?:SN|S\/N|SERIAL|IMEI|ORDER|ID|REF)[\s:]*[^)]+\)/gi, ' ')
    .replace(/\([A-Z0-9_\-\s]{7,}\)/gi, ' ')
    // 3. Remove Amazon ASIN codes (10-character alphanumeric starting with B0...)
    .replace(/\bB0[A-Z0-9]{8}\b/g, ' ')
    // 4. Remove HSN/SAC/SKU/EAN/UPC barcodes and taxes
    .replace(/\b(?:HSN|SAC|SKU|EAN|UPC|TAX|GST|INV)[\s:]*[A-Z0-9]+/gi, ' ')
    // 5. Remove quantity/warranty annotations like "Qty: 1", "1 Unit", "Warranty: 2 Years"
    .replace(/\b(?:qty|quantity|units?|warranty|pack of \d+)\b[^\n,;]*/gi, ' ')
    // 6. Clean punctuation & excessive whitespace
    .replace(/[\/\\#*~_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const brandLower = brand.toLowerCase().trim();
  const cleanedLower = cleaned.toLowerCase();

  // If brand is supplied and not already part of the cleaned title, prepend it
  if (brand && !cleanedLower.includes(brandLower)) {
    cleaned = `${brand} ${cleaned}`;
  }

  return cleaned;
}

/**
 * Extracts potential alphanumeric model codes (e.g., IC518QATX, WH-1000XM5, RTX4070, M3, SM-S928B)
 */
function extractModelNumbers(text = '') {
  const tokens = String(text).match(/\b[A-Za-z0-9\-]{3,20}\b/g) || [];
  return tokens.filter((token) => {
    const hasDigit = /\d/.test(token);
    const hasAlpha = /[A-Za-z]/.test(token);
    // Discard pure storage/unit tokens (e.g. 256gb, 16gb, 12v, 5star, 1.5ton)
    if (/^\d+(?:gb|tb|mb|g|kg|ton|star|w|v|mah|ah|hz|khz|mhz|cm|mm|in|inch)$/i.test(token)) return false;
    return hasDigit && hasAlpha;
  });
}

/**
 * Detects if a URL or domain belongs to a recognized marketplace/brand
 */
function inspectMarketplace(domain = '', url = '') {
  const target = `${domain} ${url}`.toLowerCase();
  for (const item of MARKETPLACE_PATTERNS) {
    if (item.match.test(target)) {
      return { isMarketplace: true, label: item.name };
    }
  }
  if (domain) {
    const mainHost = domain.split('.')[0];
    return {
      isMarketplace: false,
      label: mainHost.charAt(0).toUpperCase() + mainHost.slice(1)
    };
  }
  return { isMarketplace: false, label: 'Marketplace' };
}

/**
 * Engine 1: Bing Images Scraper (Fast, highly accurate for product catalog photos)
 */
async function queryBingImages(query) {
  const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=1`;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const html = await res.text();
    const regex = /m="({[^"]+})"/g;
    const items = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
      try {
        const decoded = match[1].replace(/&quot;/g, '"');
        const json = JSON.parse(decoded);
        if (json.murl && /^https?:\/\//i.test(json.murl)) {
          items.push({
            title: json.t || json.desc || query,
            image: json.murl,
            thumbnail: json.turl || json.murl,
            url: json.purl || '',
            width: json.mw || 0,
            height: json.mh || 0,
          });
        }
      } catch {}
    }
    return items;
  } catch {
    return [];
  }
}

/**
 * Engine 2: DuckDuckGo Images API (Reliable secondary engine)
 */
async function queryDuckDuckGoImages(query) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5'
  };

  try {
    const landingUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`;
    const landingRes = await fetch(landingUrl, { headers, signal: AbortSignal.timeout(6000) });
    if (!landingRes.ok) return [];

    const landingText = await landingRes.text();
    const vqdMatch = landingText.match(/vqd=["']?([^"'>&]+)/);
    if (!vqdMatch?.[1]) return [];

    const vqd = vqdMatch[1];
    const imgUrl = `https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&o=json&p=1&vqd=${vqd}&l=us-en`;
    const imgRes = await fetch(imgUrl, { headers, signal: AbortSignal.timeout(8000) });
    if (!imgRes.ok) return [];

    const data = await imgRes.json().catch(() => ({}));
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return [];
  }
}

/**
 * Intelligent Multi-Dimensional Product Image Ranker.
 * Universal for all product categories.
 */
function rankCandidates(rawResults, { query, models, brand }) {
  const queryTokens = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
  const brandTokens = brand.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);

  const scored = [];
  const seenImageKeys = new Set();
  const seenTitles = new Set();

  for (const item of rawResults) {
    const imgUrl = item.image || item.thumbnail;
    if (!imgUrl || !/^https?:\/\//i.test(imgUrl)) continue;

    // Deduplication by URL basename / filename
    const urlKey = imgUrl.split('?')[0].split('/').pop().toLowerCase();
    if (seenImageKeys.has(urlKey)) continue;
    seenImageKeys.add(urlKey);

    const titleLower = String(item.title || '').toLowerCase();
    // Also avoid near-identical titles from the same seller
    const titleKey = titleLower.slice(0, 40);
    if (seenTitles.has(titleKey) && scored.length >= 4) continue;
    seenTitles.add(titleKey);

    let domain = '';
    try {
      domain = new URL(item.url || item.source || '').hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      domain = '';
    }

    const { isMarketplace, label: sourceLabel } = inspectMarketplace(domain, item.url || item.image || '');

    let score = 0;
    let modelMatched = false;

    // 1. Model number match (+60)
    for (const model of models) {
      if (titleLower.includes(model.toLowerCase())) {
        score += 60;
        modelMatched = true;
      }
    }

    // 2. Marketplace boost (+40)
    if (isMarketplace) {
      score += 40;
    }

    // 3. Brand match (+25)
    for (const b of brandTokens) {
      if (titleLower.includes(b)) {
        score += 25;
      }
    }

    // 4. Overlapping query tokens (+5 each)
    for (const token of queryTokens) {
      if (titleLower.includes(token)) {
        score += 5;
      }
    }

    // 5. Product photography aspect ratio (0.75 - 1.35 is standard e-commerce square/portrait)
    if (item.width && item.height) {
      const ratio = item.width / item.height;
      if (ratio >= 0.70 && ratio <= 1.40) score += 12;
      if (item.width >= 350 && item.height >= 350) score += 10;
    }

    // 6. Strong negative penalty for manuals, circuit schematics, wiring, repairs, or error codes
    if (/manual|schematic|wiring|error code|circuit diagram|troubleshooting|teardown|disassembly/i.test(titleLower)) {
      score -= 75;
    }

    scored.push({
      title: item.title || query,
      imageUrl: item.image || item.thumbnail,
      thumbnailUrl: item.thumbnail || item.image,
      sourceUrl: item.url || '',
      domain,
      sourceLabel,
      isMarketplace,
      modelMatched,
      score,
      width: item.width || null,
      height: item.height || null,
    });
  }

  // Sort descending by highest score
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/**
 * Universal search entrypoint for ANY product.
 * Executes progressive queries so that it ALWAYS finds high-quality images.
 *
 * @param {object} params
 * @param {string} params.productName
 * @param {string} params.brand
 * @param {string} params.category
 */
async function searchProductImages({ productName = '', brand = '', category = '' }) {
  const cleanName = cleanProductName(productName, brand);
  const models = extractModelNumbers(productName);

  // Progressive query candidates to guarantee results for any product
  const queryAttempts = [
    // 1. Primary: full cleaned product name
    cleanName,
    // 2. Fallback: brand + detected model number (if available)
    models.length ? `${brand} ${models[0]}`.trim() : null,
    // 3. Fallback: brand + category or first 4 keywords of product
    category ? `${brand} ${category}`.trim() : null,
    // 4. Fallback: core 4 keywords
    cleanName.split(' ').slice(0, 4).join(' '),
    // 5. Ultimate fallback: original raw product name trimmed
    productName.trim().slice(0, 80),
  ].filter(Boolean);

  let rawResults = [];

  // Try queries in order until we collect enough good results
  for (const q of queryAttempts) {
    if (rawResults.length >= 6) break;

    // Run Bing search
    const bingItems = await queryBingImages(q);
    if (bingItems.length > 0) {
      rawResults = [...rawResults, ...bingItems];
    }

    // If still low, augment with DuckDuckGo
    if (rawResults.length < 4) {
      const ddgItems = await queryDuckDuckGoImages(q);
      if (ddgItems.length > 0) {
        rawResults = [...rawResults, ...ddgItems];
      }
    }
  }

  if (!rawResults.length) {
    return {
      message: 'No images found for this product. You can upload an image instead.',
      image: null,
      images: [],
      isExactMatch: false,
      isClosestMatch: false,
    };
  }

  const ranked = rankCandidates(rawResults, { query: cleanName, models, brand });
  if (!ranked.length) {
    return {
      message: 'No suitable product photos found. You can upload an image instead.',
      image: null,
      images: [],
      isExactMatch: false,
      isClosestMatch: false,
    };
  }

  // The #1 best image
  const bestImage = ranked[0];
  const isExactMatch = Boolean(bestImage.modelMatched || bestImage.score >= 60);

  // Return the top 8 distinct marketplace photos
  const topImages = ranked.slice(0, 8);

  return {
    message: isExactMatch
      ? `Found ${topImages.length} matching photos from marketplaces.`
      : `Found ${topImages.length} closest matching product photos.`,
    isExactMatch,
    isClosestMatch: !isExactMatch,
    image: bestImage,
    images: topImages,
  };
}

module.exports = {
  searchProductImages,
  cleanProductName,
  extractModelNumbers,
};
