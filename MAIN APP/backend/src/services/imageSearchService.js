/**
 * imageSearchService.js â€” Direct E-Commerce Marketplace Product Image Search
 *
 * Scrapes product images DIRECTLY from:
 *   â€¢ Amazon.in / Amazon.com
 *   â€¢ Flipkart
 *   â€¢ Best Buy
 *   â€¢ Croma
 *   â€¢ Snapdeal
 *
 * Falls back to DuckDuckGo / Bing if direct scrapers return fewer than 4 results.
 * Wikipedia is NOT used.
 */

// â”€â”€â”€ Browser-like headers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-IN,en-US;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  Connection: 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Cache-Control': 'no-cache',
};

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Cleans product name, strips noise, enriches with color + storage from description.
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

  const colorRegex =
    /\b(starlight|midnight|space grey|space gray|silver|gold|rose gold|titanium|blue|purple|red|green|yellow|black|white|graphite|alpine|sierra|coral|lavender|cream|phantom)\b/i;
  if (!cleaned.match(colorRegex) && description) {
    const c = description.match(colorRegex);
    if (c) cleaned = `${cleaned} ${c[0]}`;
  }

  const storageRegex = /\b(\d+\s*(?:GB|TB|MB))\b/i;
  if (!storageRegex.test(cleaned) && description) {
    const s = description.match(storageRegex);
    if (s) cleaned = `${cleaned} ${s[0]}`;
  }

  const brandLower = brand.toLowerCase().trim();
  if (brand && !cleaned.toLowerCase().includes(brandLower)) {
    cleaned = `${brand} ${cleaned}`;
  }

  return cleaned.trim();
}

/**
 * Extracts model numbers like "13", "S24", "XR500", "MX560".
 */
function extractModelNumbers(text = '') {
  const tokens = String(text).match(/\b[A-Za-z0-9\-]{2,20}\b/g) || [];
  return tokens.filter((t) => {
    if (/^\d+(?:gb|tb|mb|g|kg|w|v|mah|hz|cm|mm|in|inch)$/i.test(t)) return false;
    if (/\d/.test(t) && /[A-Za-z]/.test(t)) return true;
    if (/^\d{2,4}$/.test(t)) return true;
    return false;
  });
}

/** Safe fetch that never throws. Returns null on error/timeout. */
async function safeFetch(url, options = {}) {
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(options.timeout || 8000),
      ...options,
    });
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

/** Normalise a raw image URL â€” ensure it's https and large-size. */
function normaliseImgUrl(url = '') {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  // Amazon: upgrade thumbnail to full-size by removing size suffix
  url = url.replace(/\._[A-Z]+\d+_\./, '.');
  // Flipkart: ensure large image
  url = url.replace(/\/\d+\/\d+\//, '/832/832/');
  return url;
}

// â”€â”€â”€ Engine 1 â€” Amazon â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Scrapes Amazon.in (and Amazon.com as fallback) search results page.
 * Extracts product-on-white images from the <img> tags inside result cards.
 */
async function scrapeAmazonImages(query) {
  const results = [];

  const urls = [
    `https://www.amazon.in/s?k=${encodeURIComponent(query)}&i=electronics`,
    `https://www.amazon.com/s?k=${encodeURIComponent(query)}&i=electronics`,
  ];

  for (const url of urls) {
    const res = await safeFetch(url, { timeout: 9000 });
    if (!res) continue;
    const html = await res.text();

    // Amazon embeds image data in data-a-dynamic-image JSON attr
    const dynamicRegex = /data-a-dynamic-image="([^"]+)"/g;
    let match;
    while ((match = dynamicRegex.exec(html)) !== null) {
      try {
        const decoded = match[1].replace(/&quot;/g, '"').replace(/&#34;/g, '"');
        const imgMap = JSON.parse(decoded);
        // imgMap = { "url": [width, height], ... } â€” pick largest
        const entries = Object.entries(imgMap);
        if (!entries.length) continue;
        entries.sort((a, b) => (b[1][0] * b[1][1]) - (a[1][0] * a[1][1]));
        const [imgUrl, [w, h]] = entries[0];
        const cleaned = normaliseImgUrl(imgUrl);
        if (cleaned) {
          results.push({
            title: query,
            image: cleaned,
            thumbnail: cleaned,
            url,
            width: w || 500,
            height: h || 500,
            source: 'amazon',
          });
        }
      } catch { /* skip */ }
    }

    if (results.length >= 8) break;
  }

  return results;
}

// â”€â”€â”€ Engine 2 â€” Flipkart â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Scrapes Flipkart search results and pulls product card images.
 */
async function scrapeFlipkartImages(query) {
  const url = `https://www.flipkart.com/search?q=${encodeURIComponent(query)}&otracker=search&as-show=on&as=off`;
  const res = await safeFetch(url, {
    timeout: 9000,
    headers: {
      ...BROWSER_HEADERS,
      Referer: 'https://www.flipkart.com/',
    },
  });
  if (!res) return [];

  const html = await res.text();
  const results = [];

  // Flipkart uses <img> with src pointing to rukminim CDN
  // Pattern: "src":"https://rukminim...jpeg"
  const imgRegex = /"(https:\/\/rukminim\d*\.flixcart\.com\/image\/\d+\/\d+\/[^"]+\.(jpeg|jpg|png|webp))"/gi;
  let match;
  const seen = new Set();

  while ((match = imgRegex.exec(html)) !== null) {
    const raw = match[1];
    // Upgrade to 832Ã—832 for high-res
    const imgUrl = normaliseImgUrl(raw);
    if (!imgUrl || seen.has(imgUrl)) continue;
    seen.add(imgUrl);
    results.push({
      title: query,
      image: imgUrl,
      thumbnail: imgUrl,
      url: 'https://www.flipkart.com',
      width: 832,
      height: 832,
      source: 'flipkart',
    });
    if (results.length >= 10) break;
  }

  return results;
}

// â”€â”€â”€ Engine 3 â€” Best Buy â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Scrapes Best Buy search results for product images.
 */
async function scrapeBestBuyImages(query) {
  const url = `https://www.bestbuy.com/site/searchpage.jsp?st=${encodeURIComponent(query)}&_dyncharset=UTF-8&id=pcat17071`;
  const res = await safeFetch(url, {
    timeout: 9000,
    headers: {
      ...BROWSER_HEADERS,
      Referer: 'https://www.bestbuy.com/',
    },
  });
  if (!res) return [];

  const html = await res.text();
  const results = [];

  // Best Buy CDN pattern: pisces.bbystatic.com or multimedia.bbycastatic.ca
  const imgRegex = /"(https:\/\/(?:pisces\.bbystatic\.com|multimedia\.bbycastatic\.ca)[^"]+\.(jpg|jpeg|png|webp))"/gi;
  let match;
  const seen = new Set();

  while ((match = imgRegex.exec(html)) !== null) {
    const imgUrl = match[1];
    if (seen.has(imgUrl)) continue;
    seen.add(imgUrl);
    results.push({
      title: query,
      image: imgUrl,
      thumbnail: imgUrl,
      url: 'https://www.bestbuy.com',
      width: 460,
      height: 460,
      source: 'bestbuy',
    });
    if (results.length >= 8) break;
  }

  return results;
}

// â”€â”€â”€ Engine 4 â€” Croma â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Scrapes Croma (Indian electronics retailer) search results.
 */
async function scrapeCromaImages(query) {
  const url = `https://www.croma.com/searchB?q=${encodeURIComponent(query)}%3Arelevance&langCode=en`;
  const res = await safeFetch(url, {
    timeout: 9000,
    headers: {
      ...BROWSER_HEADERS,
      Referer: 'https://www.croma.com/',
    },
  });
  if (!res) return [];

  const html = await res.text();
  const results = [];

  // Croma CDN: media.croma.com
  const imgRegex = /"(https:\/\/media\.croma\.com\/image\/upload\/[^"]+\.(jpg|jpeg|png|webp))"/gi;
  let match;
  const seen = new Set();

  while ((match = imgRegex.exec(html)) !== null) {
    const imgUrl = match[1];
    if (seen.has(imgUrl)) continue;
    seen.add(imgUrl);
    results.push({
      title: query,
      image: imgUrl,
      thumbnail: imgUrl,
      url: 'https://www.croma.com',
      width: 500,
      height: 500,
      source: 'croma',
    });
    if (results.length >= 6) break;
  }

  return results;
}

// â”€â”€â”€ Engine 5 â€” DuckDuckGo Images (fallback) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function queryDuckDuckGoImages(query) {
  try {
    const landingUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`;
    const landingRes = await safeFetch(landingUrl, { timeout: 6000 });
    if (!landingRes) return [];

    const landingText = await landingRes.text();
    const vqdMatch = landingText.match(/vqd=["']?([^"'>&]+)/);
    if (!vqdMatch?.[1]) return [];

    const vqd = vqdMatch[1];
    const imgApiUrl =
      `https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&o=json&p=1&vqd=${vqd}&l=us-en&f=,,,,,&v7exp=a`;
    const imgRes = await safeFetch(imgApiUrl, {
      timeout: 8000,
      headers: { ...BROWSER_HEADERS, Referer: 'https://duckduckgo.com/' },
    });
    if (!imgRes) return [];

    const data = await imgRes.json().catch(() => ({}));
    if (!Array.isArray(data.results)) return [];

    return data.results.map((r) => ({
      title:     r.title    || query,
      image:     r.image,
      thumbnail: r.thumbnail || r.image,
      url:       r.url      || '',
      width:     r.width    || 0,
      height:    r.height   || 0,
      source:    'duckduckgo',
    }));
  } catch {
    return [];
  }
}

// â”€â”€â”€ Engine 6 â€” Bing Images (fallback) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function queryBingImages(query) {
  const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=1&tsc=ImageBasicHover`;
  const res = await safeFetch(url, {
    timeout: 8000,
    headers: { ...BROWSER_HEADERS, Referer: 'https://www.bing.com/' },
  });
  if (!res) return [];

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
          title:     json.t    || json.desc || query,
          image:     json.murl,
          thumbnail: json.turl || json.murl,
          url:       json.purl || '',
          width:     json.mw   || 0,
          height:    json.mh   || 0,
          source:    'bing',
        });
      }
    } catch { /* skip */ }
  }
  return items;
}

// â”€â”€â”€ Ranker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const SOURCE_BOOST = {
  amazon:     70,
  flipkart:   70,
  bestbuy:    65,
  croma:      60,
  duckduckgo: 0,
  bing:       0,
};

const IRRELEVANT_PATTERN =
  /\b(?:ripe|fruit|branch|eating|recipe|botanical|flora|orchard|grove|garden|food|juice|blossom|petal|storefront|building|headquarters|campus|exercise|fitness|sheet\s*music|spiral\s*bound|schematic|wiring|error\s*code|diagram|logo|vector|illustration|artwork|stock\s*photo|stock\s*image|clipart|cartoon|animal|bird|dog|cat|plant|tree|leaf)\b/i;

const COMMERCIAL_PATTERN =
  /\b(?:buy|shop|price|deal|review|spec|unbox|official|launch|release|gb|tb|inch|hz)\b/i;

function rankCandidates(rawResults, { query, models, brand }) {
  const queryTokens    = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
  const brandTokens    = brand.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
  const nonBrandTokens = queryTokens.filter(
    (t) => !brandTokens.includes(t) && !/^(the|and|for|with|pro|max|plus|gb|tb|buy)$/i.test(t)
  );

  const scored      = [];
  const seenImgKeys = new Set();
  const seenTitles  = new Set();

  for (const item of rawResults) {
    const imgUrl = item.image || item.thumbnail;
    if (!imgUrl || !/^https?:\/\//i.test(imgUrl)) continue;
    if (/\.svg(?:\.png)?/i.test(imgUrl)) continue; // reject SVGs

    const urlKey = imgUrl.split('?')[0].split('/').pop().toLowerCase();
    if (seenImgKeys.has(urlKey)) continue;
    seenImgKeys.add(urlKey);

    const titleLower = String(item.title || '').toLowerCase();
    const titleKey   = titleLower.slice(0, 40);
    if (seenTitles.has(titleKey) && scored.length >= 4) continue;
    seenTitles.add(titleKey);

    let domain = '';
    try {
      domain = new URL(item.url || '').hostname.replace(/^www\./, '').toLowerCase();
    } catch { domain = ''; }

    let score        = 0;
    let modelMatched = false;

    // 1. Marketplace source bonus (biggest signal â€” direct scrapers always win)
    score += SOURCE_BOOST[item.source] || 0;

    // 2. Model number match in title (+60) or image URL (+20)
    for (const model of models) {
      const m = model.toLowerCase();
      if (titleLower.includes(m))           { score += 60; modelMatched = true; }
      if (imgUrl.toLowerCase().includes(m)) { score += 20; modelMatched = true; }
    }

    // 3. Brand match in title
    for (const b of brandTokens) {
      if (titleLower.includes(b)) score += 25;
    }

    // 4. Query token overlap
    let nonBrandMatchedCount = 0;
    for (const token of queryTokens) {
      if (titleLower.includes(token)) {
        score += 10;
        if (nonBrandTokens.includes(token)) nonBrandMatchedCount++;
      }
    }

    // 5. Penalty: no non-brand tokens matched at all
    if (nonBrandTokens.length > 0 && nonBrandMatchedCount === 0) score -= 120;

    // 6. Hard penalty for irrelevant content (botanical, food, logos, etc.)
    if (IRRELEVANT_PATTERN.test(titleLower)) score -= 120;

    // 7. Commercial-intent bonus
    if (COMMERCIAL_PATTERN.test(titleLower)) score += 15;

    // 8. Aspect-ratio bonus (square or near-square = product photography)
    if (item.width && item.height) {
      const ratio = item.width / item.height;
      if (ratio >= 0.65 && ratio <= 1.55) score += 12;
      if (item.width >= 350 && item.height >= 350) score += 10;
    }

    // Gate: discard non-positive scores
    if (score <= 0) continue;

    scored.push({
      title:        item.title || query,
      imageUrl:     imgUrl,
      thumbnailUrl: item.thumbnail || imgUrl,
      sourceUrl:    item.url || '',
      domain,
      sourceLabel:  item.source || domain || 'Marketplace',
      isMarketplace: ['amazon', 'flipkart', 'bestbuy', 'croma'].includes(item.source),
      modelMatched,
      score,
      width:  item.width  || null,
      height: item.height || null,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// â”€â”€â”€ Public Entry Point â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function searchProductImages({ productName = '', brand = '', category = '', description = '' }) {
  const cleanName = cleanProductName(productName, brand, description);
  const models    = extractModelNumbers(productName);

  // Primary query for direct scrapers
  const primaryQuery = cleanName;
  // Fallback: shorter, model-focused
  const fallbackQuery = models.length
    ? `${brand} ${models[0]}`.trim()
    : cleanName.split(' ').slice(0, 4).join(' ');

  let rawResults = [];

  // â”€â”€ Phase 1: Direct marketplace scrapers (best quality) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [amazonItems, flipkartItems, bestBuyItems, cromaItems] = await Promise.allSettled([
    scrapeAmazonImages(primaryQuery),
    scrapeFlipkartImages(primaryQuery),
    scrapeBestBuyImages(primaryQuery),
    scrapeCromaImages(primaryQuery),
  ]);

  for (const r of [amazonItems, flipkartItems, bestBuyItems, cromaItems]) {
    if (r.status === 'fulfilled') rawResults = [...rawResults, ...r.value];
  }

  // â”€â”€ Phase 2: Fallback query on marketplaces if still thin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (rawResults.length < 6 && fallbackQuery !== primaryQuery) {
    const [a2, f2] = await Promise.allSettled([
      scrapeAmazonImages(fallbackQuery),
      scrapeFlipkartImages(fallbackQuery),
    ]);
    for (const r of [a2, f2]) {
      if (r.status === 'fulfilled') rawResults = [...rawResults, ...r.value];
    }
  }

  // â”€â”€ Phase 3: DuckDuckGo + Bing fallback if still thin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (rawResults.length < 6) {
    const [ddg, bing] = await Promise.allSettled([
      queryDuckDuckGoImages(`${primaryQuery} buy`),
      queryBingImages(`${primaryQuery} buy`),
    ]);
    for (const r of [ddg, bing]) {
      if (r.status === 'fulfilled') rawResults = [...rawResults, ...r.value];
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

  const bestImage    = ranked[0];
  const isExactMatch = Boolean(bestImage.modelMatched || bestImage.score >= 60);
  const topImages    = ranked.slice(0, 8);

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