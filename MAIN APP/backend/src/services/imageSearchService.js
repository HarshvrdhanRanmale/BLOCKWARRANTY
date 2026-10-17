/**
 * imageSearchService.js — Universal Marketplace Product Image Search
 *
 * Designed to aggressively find authentic commercial product photos for ANY electronic product
 * (Smartphones, Laptops, Headphones, TVs, Smartwatches, Appliances, Gaming, Audio, etc.)
 * across global and regional e-commerce marketplaces (Amazon, Best Buy, Apple, Flipkart, etc.).
 */

const MARKETPLACE_PATTERNS = [
  // Global Marketplaces
  { id: 'amazon', name: 'Amazon', match: /amazon|media-amazon/i },
  { id: 'bestbuy', name: 'Best Buy', match: /bestbuy|bbystatic/i },
  { id: 'walmart', name: 'Walmart', match: /walmart|walmartimages/i },
  { id: 'target', name: 'Target', match: /target/i },
  { id: 'ebay', name: 'eBay', match: /ebay/i },
  { id: 'newegg', name: 'Newegg', match: /newegg/i },
  { id: 'bhphoto', name: 'B&H Photo', match: /bhphotovideo/i },
  { id: 'costco', name: 'Costco', match: /costco/i },

  // Regional Marketplaces (India / Asia / Europe)
  { id: 'flipkart', name: 'Flipkart', match: /flipkart|flixcart/i },
  { id: 'croma', name: 'Croma', match: /croma/i },
  { id: 'reliancedigital', name: 'Reliance Digital', match: /reliancedigital/i },
  { id: 'tatacliq', name: 'Tata CLiQ', match: /tatacliq/i },
  { id: 'vijaysales', name: 'Vijay Sales', match: /vijaysales/i },
  { id: 'poorvika', name: 'Poorvika', match: /poorvika/i },
  { id: 'indiamart', name: 'IndiaMART', match: /indiamart|imimg/i },
  { id: 'ldlc', name: 'LDLC', match: /ldlc/i },

  // Direct Manufacturer Stores
  { id: 'apple', name: 'Apple', match: /apple\.com|cdn-apple\.com/i },
  { id: 'samsung', name: 'Samsung', match: /samsung/i },
  { id: 'sony', name: 'Sony', match: /sony/i },
  { id: 'dell', name: 'Dell', match: /dell/i },
  { id: 'lenovo', name: 'Lenovo', match: /lenovo/i },
  { id: 'hp', name: 'HP', match: /hp\.com/i },
  { id: 'asus', name: 'ASUS', match: /asus/i },
  { id: 'lg', name: 'LG', match: /lg\.com/i },
  { id: 'bose', name: 'Bose', match: /bose/i },
  { id: 'dyson', name: 'Dyson', match: /dyson/i },
];

/**
 * Cleans product name and enriches with description (color, storage, specs)
 */
function cleanProductName(productName = '', brand = '', description = '') {
  let cleaned = String(productName || '')
    .replace(/\|\s*[^|\n]+/g, ' ')
    .replace(/\((?:SN|S\/N|SERIAL|IMEI|ORDER|ID|REF)[\s:]*[^)]+\)/gi, ' ')
    .replace(/\([A-Z0-9_\-\s]{7,}\)/gi, ' ')
    .replace(/\bB0[A-Z0-9]{8}\b/g, ' ')
    .replace(/\b(?:HSN|SAC|SKU|EAN|UPC|TAX|GST|INV)[\s:]*[A-Z0-9]+/gi, ' ')
    .replace(/\b(?:qty|quantity|units?|warranty|pack of \d+)\b[^\n,;]*/gi, ' ')
    .replace(/[\/\\#*~_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // If description has color or capacity keywords not in cleaned, include them
  if (description) {
    const descLower = description.toLowerCase();
    const colorMatches = descLower.match(/\b(starlight|midnight|space grey|space gray|silver|gold|rose gold|titanium|blue|purple|red|green|yellow|black|white)\b/i);
    if (colorMatches && !cleaned.toLowerCase().includes(colorMatches[0].toLowerCase())) {
      cleaned = `${cleaned} ${colorMatches[0]}`;
    }
  }

  const brandLower = brand.toLowerCase().trim();
  const cleanedLower = cleaned.toLowerCase();

  if (brand && !cleanedLower.includes(brandLower)) {
    cleaned = `${brand} ${cleaned}`;
  }

  return cleaned;
}

/**
 * Extracts alphanumeric and numeric model numbers
 */
function extractModelNumbers(text = '') {
  const tokens = String(text).match(/\b[A-Za-z0-9\-]{2,20}\b/g) || [];
  return tokens.filter((token) => {
    const hasDigit = /\d/.test(token);
    const hasAlpha = /[A-Za-z]/.test(token);
    if (/^\d+(?:gb|tb|mb|g|kg|ton|star|w|v|mah|ah|hz|khz|mhz|cm|mm|in|inch)$/i.test(token)) return false;
    if (hasDigit && hasAlpha) return true;
    if (/^\d{2,4}$/.test(token)) return true;
    return false;
  });
}

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
 * Engine 1: DuckDuckGo Images API — Returns authentic commercial photos from Best Buy, Amazon, Apple, etc.
 */
async function queryDuckDuckGoImages(query) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
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
    if (!Array.isArray(data.results)) return [];
    return data.results.map((r) => ({
      title: r.title || query,
      image: r.image,
      thumbnail: r.thumbnail || r.image,
      url: r.url || '',
      width: r.width || 0,
      height: r.height || 0,
    }));
  } catch {
    return [];
  }
}

/**
 * Engine 2: Bing Images Scraper
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
 * Engine 3: Wikipedia & Wikimedia Commons API (Photo only, strictly filters out .svg vector wireframes)
 */
async function queryWikipediaImages(query) {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&generator=search&gsrsearch=${encodeURIComponent(query)}&pithumbsize=800&origin=*`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'BlockWarranty/1.0 (contact@blockwarranty.app)' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const pages = Object.values(data?.query?.pages || {});
    return pages
      .filter((p) => (
        p.thumbnail?.source &&
        !p.thumbnail.source.includes('.svg') &&
        !/logo|flag|icon|building|store|apple_store|vector/i.test(p.title)
      ))
      .map((p) => ({
        title: p.title,
        image: p.thumbnail.source,
        thumbnail: p.thumbnail.source,
        url: `https://en.wikipedia.org/?curid=${p.pageid}`,
        width: p.thumbnail.width || 800,
        height: p.thumbnail.height || 800,
      }));
  } catch {
    return [];
  }
}

/**
 * Intelligent Multi-Dimensional Product Image Ranker.
 * Strictly discards non-positive and irrelevant matches.
 */
function rankCandidates(rawResults, { query, models, brand }) {
  const queryTokens = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
  const brandTokens = brand.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
  const nonBrandTokens = queryTokens.filter((t) => !brandTokens.includes(t) && !/^(the|and|for|with|pro|max|plus|gb|tb)$/i.test(t));

  const scored = [];
  const seenImageKeys = new Set();
  const seenTitles = new Set();

  for (const item of rawResults) {
    const imgUrl = item.image || item.thumbnail;
    if (!imgUrl || !/^https?:\/\//i.test(imgUrl)) continue;

    // Reject vector wireframes or svg URLs completely
    if (/\.svg(?:\.png)?/i.test(imgUrl)) continue;

    const urlKey = imgUrl.split('?')[0].split('/').pop().toLowerCase();
    if (seenImageKeys.has(urlKey)) continue;
    seenImageKeys.add(urlKey);

    const titleLower = String(item.title || '').toLowerCase();
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

    // 2. Marketplace boost (+45)
    if (isMarketplace) {
      score += 45;
    }

    // 3. Brand match (+25)
    for (const b of brandTokens) {
      if (titleLower.includes(b)) {
        score += 25;
      }
    }

    // 4. Overlapping query tokens (+10 each)
    let nonBrandMatchedCount = 0;
    for (const token of queryTokens) {
      if (titleLower.includes(token)) {
        score += 10;
        if (nonBrandTokens.includes(token)) nonBrandMatchedCount++;
      }
    }

    // 5. Heavy penalty if product has non-brand words (e.g. "iphone", "13") and NONE matched
    if (nonBrandTokens.length > 0 && nonBrandMatchedCount === 0) {
      score -= 100;
    }

    // 6. Strong negative penalty for botanical fruits, food, recipes, buildings, logos, wireframes
    if (/ripe|fruit|branch|eating|recipe|botanical|storefront|building|headquarters|exercise|sheet music|spiral bound|schematic|wiring|error code|diagram|logo|vector/i.test(titleLower)) {
      score -= 100;
    }

    // 7. Standard product photography aspect ratio
    if (item.width && item.height) {
      const ratio = item.width / item.height;
      if (ratio >= 0.70 && ratio <= 1.40) score += 12;
      if (item.width >= 350 && item.height >= 350) score += 10;
    }

    // STRICT: Discard any result with score <= 0 (eliminates fruits, buildings, logos)
    if (score <= 0) continue;

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

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/**
 * Universal search entrypoint for ANY electronic product.
 */
async function searchProductImages({ productName = '', brand = '', category = '', description = '' }) {
  const cleanName = cleanProductName(productName, brand, description);
  const models = extractModelNumbers(productName);

  const queryAttempts = [
    cleanName,
    models.length ? `${brand} ${models[0]}`.trim() : null,
    models.length ? `${cleanName.split(' ').slice(0, 3).join(' ')} ${models[0]}`.trim() : null,
    category ? `${brand} ${category}`.trim() : null,
    cleanName.split(' ').slice(0, 4).join(' '),
    productName.trim().slice(0, 80),
  ].filter(Boolean);

  let rawResults = [];

  for (const q of queryAttempts) {
    if (rawResults.length >= 12) break;

    // 1. DuckDuckGo (Commercial e-commerce photos: Best Buy, Amazon, Apple, Walmart, etc.)
    const ddgItems = await queryDuckDuckGoImages(q);
    if (ddgItems.length > 0) {
      rawResults = [...rawResults, ...ddgItems];
    }

    // 2. Bing Images fallback
    if (rawResults.length < 8) {
      const bingItems = await queryBingImages(q);
      if (bingItems.length > 0) {
        rawResults = [...rawResults, ...bingItems];
      }
    }

    // 3. Wikipedia fallback (photo only, no SVG wireframes)
    if (rawResults.length < 4) {
      const wikiItems = await queryWikipediaImages(q);
      if (wikiItems.length > 0) {
        rawResults = [...rawResults, ...wikiItems];
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

  const bestImage = ranked[0];
  const isExactMatch = Boolean(bestImage.modelMatched || bestImage.score >= 60);
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
