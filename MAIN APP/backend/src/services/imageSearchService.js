/**
 * imageSearchService.js — Electronics Product Image Search (India-optimised)
 *
 * Engines (all run in PARALLEL):
 *   1. DuckDuckGo Images  — primary
 *   2. Bing Images         — secondary
 *   3. Yahoo Images        — tertiary
 *
 * All three engines already index Amazon.in, Flipkart, Croma, Best Buy etc.
 * No direct marketplace scraping (blocked by anti-bot).
 * No Wikipedia.
 *
 * CDN auto-boost: any image URL from a known product CDN (rukminim/media-amazon/
 * bbystatic etc.) gets +80 score automatically — guarantees marketplace images
 * win even when the search-engine title does not contain all keywords.
 */

'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** Image URLs that contain these strings are definitively product photos. */
const PRODUCT_CDN =
  /media-amazon\.com|rukminim\d*\.flixcart\.com|pisces\.bbystatic\.com|bbycastatic|media\.croma\.com|snapdeal\.com\/imagesSubDomain|assets\.myntassets|nykaa\.com\/media|tatacliq|jiomart|reliancedigital|vijaysales|samsung\.com\/image|cdn-apple\.com|store\.storeimages\.cdn-apple\.com|assets\.sony|images\.dell|hp\.com\/content|asus\.com\/media|img\.global\.news\.samsung|assets\.logitech|motorola\.com\/sites|mi\.com\/assets|realme\.com\/assets|oneplus\.com\/img|gsmarena\.com\/pics|notebookcheck\.net\/fileadmin|rtings\.com\/imagesS|cnet\.com\/api\/res|cdn\.mos\.cms\.futurecdn|media\.wired\.com|cdn\.arstechnica\.net/i;

/** Hard-penalise titles that indicate clearly irrelevant images. */
const IRRELEVANT =
  /\b(ripe|fruit|branch|eating|recipe|botanical|flora|orchard|grove|garden|food|juice|blossom|petal|storefront|building|headquarters|campus|exercise|fitness|sheet\s*music|schematic|wiring|clipart|cartoon|plant|tree|leaf|animal|dog|cat|bird|fish|insect|bug|stock\s*photo|stock\s*image|public\s*domain|free\s*photo|free\s*stock|royalty.*free|illustration|artwork|wallpaper|icon\b|logo|apple\s*store|apple\s*park|apple\s*campus|apple\s*inc)\b/i;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cleanProductName(productName = '', brand = '', description = '') {
  let s = String(productName || '')
    .replace(/\|\s*[^|\n]+/g, ' ')
    .replace(/\((?:SN|S\/N|SERIAL|IMEI|ORDER|ID|REF)[\s:]*[^)]+\)/gi, ' ')
    .replace(/\([A-Z0-9_\-\s]{10,}\)/gi, ' ')
    .replace(/\bB0[A-Z0-9]{8}\b/g, ' ')
    .replace(/\b(?:HSN|SAC|SKU|EAN|UPC|TAX|GST|INV)[\s:]*[A-Z0-9]+/gi, ' ')
    .replace(/\b(?:qty|quantity|units?|warranty|pack of \d+)\b[^\n,;]*/gi, ' ')
    .replace(/[\/\\#*~_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Enrich with colour from description
  const COLOR_RE =
    /\b(starlight|midnight|space grey|space gray|silver|gold|rose gold|titanium|blue|purple|red|green|yellow|black|white|graphite|coral|lavender|cream|phantom|alpine|sierra)\b/i;
  if (!s.match(COLOR_RE) && description) {
    const c = description.match(COLOR_RE);
    if (c) s += ` ${c[0]}`;
  }

  // Enrich with storage from description
  const STOR_RE = /\b(\d+\s*(?:GB|TB|MB))\b/i;
  if (!STOR_RE.test(s) && description) {
    const st = description.match(STOR_RE);
    if (st) s += ` ${st[0]}`;
  }

  if (brand && !s.toLowerCase().includes(brand.toLowerCase())) {
    s = `${brand} ${s}`;
  }

  return s.trim();
}

function extractModelNumbers(text = '') {
  return (String(text).match(/\b[A-Za-z0-9\-]{2,20}\b/g) || []).filter(t => {
    if (/^\d+(?:gb|tb|mb|g|kg|w|v|mah|hz|cm|mm|in|inch)$/i.test(t)) return false;
    if (/\d/.test(t) && /[A-Za-z]/.test(t)) return true;
    if (/^\d{2,4}$/.test(t)) return true;
    return false;
  });
}

/** Strip brackets/parens so they are not interpreted as search operators. */
function toSearchQuery(name) {
  return name.replace(/[()[\]{}<>]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function safeFetch(url, { timeout = 9000, extraHeaders = {} } = {}) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'en-IN,en-US;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        ...extraHeaders,
      },
      signal: AbortSignal.timeout(timeout),
    });
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

// ─── Engine 1: DuckDuckGo ─────────────────────────────────────────────────────

async function queryDuckDuckGoImages(query) {
  try {
    const HEADS = { Referer: 'https://duckduckgo.com/' };

    const landing = await safeFetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`,
      { timeout: 8000, extraHeaders: HEADS }
    );
    if (!landing) return [];
    const html = await landing.text();

    let vqd = null;
    const VQD_PATTERNS = [
      /vqd=["']?([^"'>&\s\]]+)/,
      /"vqd":"([^"]+)"/,
      /vqd:"([^"]+)"/,
      /data-vqd="([^"]+)"/,
      /initialVqd:"([^"]+)"/,
      /['"]vqd['"]\s*:\s*['"]([^'"]+)['"]/,
    ];
    for (const p of VQD_PATTERNS) {
      const m = html.match(p);
      if (m?.[1] && m[1].length > 3) { vqd = m[1]; break; }
    }
    if (!vqd) return [];

    const api = await safeFetch(
      `https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&o=json&p=1&vqd=${encodeURIComponent(vqd)}&l=us-en&f=,,,,,`,
      { timeout: 10000, extraHeaders: { ...HEADS, Accept: 'application/json,*/*' } }
    );
    if (!api) return [];

    const data = await api.json().catch(() => null);
    if (!Array.isArray(data?.results)) return [];

    return data.results.slice(0, 25).filter(r => r.image).map(r => ({
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

// ─── Engine 2: Bing Images ───────────────────────────────────────────────────

async function queryBingImages(query) {
  try {
    const res = await safeFetch(
      `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=1`,
      { timeout: 10000, extraHeaders: { Referer: 'https://www.bing.com/' } }
    );
    if (!res) return [];
    const html = await res.text();

    const items = [];
    const seen  = new Set();
    let m;

    const addItem = (imgUrl, title, thumbUrl, pageUrl, w, h) => {
      if (!imgUrl || !/^https?:\/\//i.test(imgUrl) || seen.has(imgUrl)) return;
      seen.add(imgUrl);
      items.push({ title: title || query, image: imgUrl, thumbnail: thumbUrl || imgUrl, url: pageUrl || '', width: w || 0, height: h || 0, source: 'bing' });
    };

    // Pattern A: m="{JSON}" — primary Bing format
    const pA = /m="({[^"]+})"/g;
    while ((m = pA.exec(html)) !== null) {
      try {
        const j = JSON.parse(m[1].replace(/&quot;/g, '"'));
        if (j.murl) addItem(j.murl, j.t || j.desc, j.turl, j.purl, j.mw, j.mh);
      } catch {}
    }

    // Pattern B: data-m="{JSON}" — alternative Bing format
    const pB = /data-m="({[^"]+})"/g;
    while ((m = pB.exec(html)) !== null) {
      try {
        const j = JSON.parse(m[1].replace(/&quot;/g, '"'));
        if (j.murl) addItem(j.murl, j.t, j.turl, j.purl, j.mw, j.mh);
      } catch {}
    }

    // Pattern C: direct CDN image URLs embedded in HTML (fallback)
    const pC = /"(https:\/\/(?:media-amazon\.com|rukminim\d*\.flixcart\.com|pisces\.bbystatic\.com|media\.croma\.com)[^"]+\.(?:jpg|jpeg|png|webp))"/gi;
    while ((m = pC.exec(html)) !== null) addItem(m[1], query, m[1], '', 500, 500);

    return items.slice(0, 30);
  } catch {
    return [];
  }
}

// ─── Engine 3: Yahoo Images ──────────────────────────────────────────────────

async function queryYahooImages(query) {
  try {
    const res = await safeFetch(
      `https://images.search.yahoo.com/search/images?p=${encodeURIComponent(query)}&fr=yfp-t&imgsz=large`,
      { timeout: 9000, extraHeaders: { Referer: 'https://images.search.yahoo.com/' } }
    );
    if (!res) return [];
    const html = await res.text();

    const items = [];
    const seen  = new Set();
    let m;

    for (const p of [
      /"origUrl":"([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi,
      /"url":"([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi,
      /src="(https:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi,
    ]) {
      while ((m = p.exec(html)) !== null) {
        const url = m[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/');
        if (/^https?:\/\//i.test(url) && !seen.has(url) && !/^https:\/\/s\.yimg\./i.test(url)) {
          seen.add(url);
          items.push({ title: query, image: url, thumbnail: url, url: '', width: 0, height: 0, source: 'yahoo' });
        }
        if (items.length >= 20) break;
      }
      if (items.length >= 20) break;
    }
    return items;
  } catch {
    return [];
  }
}

// ─── Ranker ───────────────────────────────────────────────────────────────────

function rankCandidates(rawResults, { cleanName, models, brand }) {
  const qT  = cleanName.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 1);
  const bT  = brand.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 1);
  const nbT = qT.filter(t => !bT.includes(t) && !/^(the|and|for|with|pro|max|plus|gb|tb|buy|india|official|product|image)$/i.test(t));

  const scored   = [];
  const seenImg  = new Set();
  const seenTitle = new Set();

  for (const item of rawResults) {
    const imgUrl = item.image || item.thumbnail;
    if (!imgUrl || !/^https?:\/\//i.test(imgUrl)) continue;
    if (/\.svg(?:\.png)?/i.test(imgUrl)) continue;

    const imgKey = imgUrl.split('?')[0].split('/').pop().toLowerCase();
    if (seenImg.has(imgKey)) continue;
    seenImg.add(imgKey);

    const titleLow = String(item.title || '').toLowerCase();
    const tKey     = titleLow.slice(0, 40);
    if (seenTitle.has(tKey) && scored.length >= 6) continue;
    seenTitle.add(tKey);

    let score        = 0;
    let modelMatched = false;

    // ① CDN auto-boost — any image from a known product marketplace CDN
    if (PRODUCT_CDN.test(imgUrl)) score += 80;

    // ② Model number match in title (+60) or image URL (+20)
    for (const model of models) {
      const m = model.toLowerCase();
      if (titleLow.includes(m))           { score += 60; modelMatched = true; }
      if (imgUrl.toLowerCase().includes(m)) { score += 20; modelMatched = true; }
    }

    // ③ Brand in title
    for (const b of bT) {
      if (titleLow.includes(b)) score += 25;
    }

    // ④ Token overlap
    let nbCount = 0;
    for (const t of qT) {
      if (titleLow.includes(t)) {
        score += 10;
        if (nbT.includes(t)) nbCount++;
      }
    }

    // ⑤ HARD SKIP: if NO non-brand product tokens match AND not a product CDN image
    //    This is the key filter that eliminates apple-fruit / Apple-Store / logos
    //    when searching for "Apple iPhone 13" — only real iPhone images get through.
    const isProductCDN = PRODUCT_CDN.test(imgUrl);
    if (nbT.length > 0 && nbCount === 0 && !isProductCDN) continue;

    // ⑥ Hard penalty for irrelevant content (belt + suspenders)
    if (IRRELEVANT.test(titleLow)) score -= 150;

    // ⑦ Penalty for ambiguous brand-only titles (e.g. "Apple" without any model word)
    //    Catches "Apple Logo", "Apple Free Stock Photo", "Apple Store" etc.
    const hasAnyProductWord = nbT.some(t => titleLow.includes(t));
    if (bT.length > 0 && !hasAnyProductWord && !isProductCDN) score -= 100;

    // ⑦ Commercial-intent bonus
    if (/\b(buy|shop|price|deal|review|spec|unbox|official|flipkart|amazon|croma|bestbuy|snapdeal|myntra)\b/i.test(titleLow)) score += 15;

    // ⑧ Aspect-ratio bonus (square/near-square = product photography)
    if (item.width && item.height) {
      const r = item.width / item.height;
      if (r >= 0.6 && r <= 1.6) score += 12;
      if (item.width >= 300 && item.height >= 300) score += 10;
    }

    // Gate: discard anything with score <= 0
    if (score <= 0) continue;

    let domain = '';
    try { domain = new URL(item.url || imgUrl).hostname.replace(/^www\./, ''); } catch {}

    scored.push({
      title:        item.title || cleanName,
      imageUrl:     imgUrl,
      thumbnailUrl: item.thumbnail || imgUrl,
      sourceUrl:    item.url || '',
      domain,
      sourceLabel:  item.source || domain || 'Web',
      isMarketplace: PRODUCT_CDN.test(imgUrl),
      modelMatched,
      score,
      width:  item.width  || null,
      height: item.height || null,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// ─── Public Entry Point ───────────────────────────────────────────────────────

async function searchProductImages({ productName = '', brand = '', category = '', description = '' }) {
  const cleanName = cleanProductName(productName, brand, description);
  const models    = extractModelNumbers(productName);
  const baseQ     = toSearchQuery(cleanName);
  const shortQ    = baseQ.split(' ').slice(0, 5).join(' ');

  // Multiple query variants — ordered most-specific to least
  const queries = [...new Set([
    `${baseQ} buy`,
    models.length ? `${brand} ${models[0]} buy`.trim() : null,
    `${baseQ} flipkart amazon india`,
    `${shortQ} official`,
    category ? `${brand} ${category} buy india`.trim() : null,
  ].filter(Boolean))];

  // Fire every engine × every query variant simultaneously
  const tasks = [];
  for (const q of queries) {
    tasks.push(queryDuckDuckGoImages(q));
    tasks.push(queryBingImages(q));
    tasks.push(queryYahooImages(q));
  }

  const settled    = await Promise.allSettled(tasks);
  const rawResults = settled
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value);

  if (!rawResults.length) {
    return {
      message: 'No images found for this product. You can upload an image instead.',
      image: null, images: [], isExactMatch: false, isClosestMatch: false,
    };
  }

  const ranked = rankCandidates(rawResults, { cleanName, models, brand });

  if (!ranked.length) {
    return {
      message: 'No suitable product photos found. You can upload an image instead.',
      image: null, images: [], isExactMatch: false, isClosestMatch: false,
    };
  }

  const best    = ranked[0];
  const isExact = Boolean(best.modelMatched || best.score >= 70);
  const top     = ranked.slice(0, 8);

  return {
    message: isExact
      ? `Found ${top.length} matching product photos.`
      : `Found ${top.length} closest matching photos.`,
    isExactMatch:   isExact,
    isClosestMatch: !isExact,
    image:  best,
    images: top,
  };
}

module.exports = { searchProductImages, cleanProductName, extractModelNumbers };
