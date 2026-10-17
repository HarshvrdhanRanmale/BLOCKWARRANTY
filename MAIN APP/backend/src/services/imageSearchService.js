/**
 * imageSearchService.js — Product Image Search
 *
 * PRIMARY: Google Custom Search Image API  (reliable from any server IP)
 *   — requires GOOGLE_API_KEY + GOOGLE_CSE_ID in .env (free 100 searches/day)
 *   — see README or setup guide for how to get free keys
 *
 * FALLBACK: Direct marketplace HTML scraping
 *   Amazon.in → Flipkart → Google Images (all attempted in parallel)
 *   Works locally; may be blocked on shared-IP deployments.
 *
 * NO Wikipedia. NO Bing. NO DuckDuckGo.
 */
'use strict';

// ─── CDN / irrelevant patterns ────────────────────────────────────────────────

const PRODUCT_CDN =
  /media-amazon\.com|rukminim\d*\.flixcart\.com|pisces\.bbystatic\.com|bbycastatic|media\.croma\.com|snapdeal\.com\/imagesSubDomain|assets\.myntassets|nykaa\.com\/media|tatacliq|jiomart\.com\/images|reliancedigital|vijaysales|samsung\.com\/image|cdn-apple\.com|store\.storeimages\.cdn-apple|assets\.sony|images\.dell|hp\.com\/content|asus\.com\/media|mi\.com\/assets|realme\.com\/assets|oneplus\.com\/img|gsmarena\.com\/pics|notebookcheck\.net\/fileadmin|cnet\.com\/api\/res|cdn\.mos\.cms\.futurecdn/i;

const IRRELEVANT =
  /\b(ripe|fruit|botanical|flora|orchard|garden|food|juice|blossom|schematic|wiring|clipart|cartoon|plant|tree|leaf|animal|dog|cat|bird|insect|stock\s*photo|public\s*domain|free\s*photo|royalty.*free|illustration|wallpaper|color\s*palette|colour\s*palette|hex\s*code|paint\s*swatch|color\s*chart|colour\s*chart|logo|apple\s*store|apple\s*park|apple\s*campus)\b/i;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

  const COLOR_RE =
    /\b(starlight|midnight|space grey|space gray|silver|gold|rose gold|titanium|blue|purple|red|green|yellow|black|white|graphite|coral|lavender|cream|phantom)\b/i;
  if (!s.match(COLOR_RE) && description) {
    const c = description.match(COLOR_RE);
    if (c) s += ` ${c[0]}`;
  }
  const STOR_RE = /\b(\d+\s*(?:GB|TB|MB))\b/i;
  if (!STOR_RE.test(s) && description) {
    const st = description.match(STOR_RE);
    if (st) s += ` ${st[0]}`;
  }
  if (brand && !s.toLowerCase().includes(brand.toLowerCase())) s = `${brand} ${s}`;
  return s.trim();
}

function extractModelNumbers(text = '') {
  return (String(text).match(/\b[A-Za-z0-9\-]{2,20}\b/g) || []).filter(t => {
    if (/^\d+(?:gb|tb|mb|g|kg|w|v|mah|hz|cm|mm|in|inch|ton|star)$/i.test(t)) return false;
    if (/\d/.test(t) && /[A-Za-z]/.test(t)) return true;
    if (/^\d{2,4}$/.test(t)) return true;
    return false;
  });
}

function toQuery(name) {
  return name.replace(/[()[\]{}<>|]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenise(str = '') {
  return new Set(String(str).toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 1));
}

async function safeFetch(url, { timeout = 10000, extra = {} } = {}) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'en-IN,en-US;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        ...extra,
      },
      signal: AbortSignal.timeout(timeout),
    });
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

// ─── Engine 1 (PRIMARY): Google Custom Search Image API ──────────────────────
//
// FREE setup (2 minutes):
//   1. Go to https://programmablesearch.google.com/create
//   2. Click "Add" → enter "www.amazon.in" → Create → Copy your Search Engine ID
//   3. In the control panel → "Edit" → turn ON "Search the entire web"
//   4. Go to https://console.cloud.google.com → APIs → Custom Search API → Enable
//   5. Credentials → Create API Key → copy it
//   6. Add to .env:
//        GOOGLE_API_KEY=your_key_here
//        GOOGLE_CSE_ID=your_cse_id_here
//   Free quota: 100 searches/day (enough for dev & demo)

async function queryGoogleCSE(query) {
  const apiKey = process.env.GOOGLE_API_KEY;
  const cseId  = process.env.GOOGLE_CSE_ID;
  if (!apiKey || !cseId) return [];           // gracefully skip if not configured

  try {
    const url =
      `https://www.googleapis.com/customsearch/v1` +
      `?key=${apiKey}&cx=${cseId}` +
      `&q=${encodeURIComponent(query)}` +
      `&searchType=image&num=10&gl=in&safe=off` +
      `&imgType=photo&imgSize=large`;

    const res = await safeFetch(url, { timeout: 8000, extra: { Accept: 'application/json' } });
    if (!res) return [];
    const data = await res.json().catch(() => null);

    if (data?.error) {
      console.warn('[imageSearch] Google CSE error:', data.error.message);
      return [];
    }
    if (!Array.isArray(data?.items)) return [];

    return data.items.map(item => ({
      title:     item.title || query,
      image:     item.link,
      thumbnail: item.image?.thumbnailLink || item.link,
      url:       item.image?.contextLink   || '',
      width:     item.image?.width         || 0,
      height:    item.image?.height        || 0,
      source:    'google_cse',
    }));
  } catch (e) {
    console.warn('[imageSearch] Google CSE failed:', e.message);
    return [];
  }
}

// ─── Engine 2 (FALLBACK): Amazon.in scraper ──────────────────────────────────

async function scrapeAmazon(query) {
  try {
    const res = await safeFetch(
      `https://www.amazon.in/s?k=${encodeURIComponent(query)}&i=electronics`,
      { timeout: 10000 }
    );
    if (!res) return [];
    const html = await res.text();

    const items = [];
    const seen  = new Set();
    const RE    = /data-a-dynamic-image="([^"]+)"/g;
    let m;
    while ((m = RE.exec(html)) !== null && items.length < 12) {
      try {
        const decoded  = m[1].replace(/&quot;/g, '"').replace(/&#34;/g, '"');
        const imgMap   = JSON.parse(decoded);
        const entries  = Object.entries(imgMap).sort((a, b) => (b[1][0] * b[1][1]) - (a[1][0] * a[1][1]));
        if (!entries.length) continue;
        const [imgUrl, [w, h]] = entries[0];
        // Upgrade Amazon thumbnail to full-size
        const full = imgUrl.replace(/\._[A-Z]+\d+_\./, '.');
        if (!seen.has(full) && /^https?:\/\//i.test(full)) {
          seen.add(full);
          items.push({ title: query, image: full, thumbnail: full, url: 'https://www.amazon.in', width: w || 500, height: h || 500, source: 'amazon' });
        }
      } catch {}
    }
    return items;
  } catch { return []; }
}

// ─── Engine 3 (FALLBACK): Flipkart scraper ───────────────────────────────────

async function scrapeFlipkart(query) {
  try {
    const res = await safeFetch(
      `https://www.flipkart.com/search?q=${encodeURIComponent(query)}&otracker=search&as=off`,
      { timeout: 10000, extra: { Referer: 'https://www.flipkart.com/' } }
    );
    if (!res) return [];
    const html = await res.text();

    const items = [];
    const seen  = new Set();
    const RE    = /"(https:\/\/rukminim\d*\.flixcart\.com\/image\/\d+\/\d+\/[^"]+\.(?:jpeg|jpg|png|webp))"/gi;
    let m;
    while ((m = RE.exec(html)) !== null && items.length < 12) {
      // Upgrade to 832×832
      const full = m[1].replace(/\/\d+\/\d+\//, '/832/832/');
      if (!seen.has(full)) {
        seen.add(full);
        items.push({ title: query, image: full, thumbnail: full, url: 'https://www.flipkart.com', width: 832, height: 832, source: 'flipkart' });
      }
    }
    return items;
  } catch { return []; }
}

// ─── Engine 4 (FALLBACK): Google Images HTML scraper ─────────────────────────

async function scrapeGoogleImages(query) {
  try {
    const res = await safeFetch(
      `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch&safe=off&hl=en&num=20&gl=in`,
      { timeout: 10000, extra: { Referer: 'https://www.google.com/', 'Sec-Fetch-Site': 'same-origin' } }
    );
    if (!res) return [];
    const html = await res.text();

    const items = [];
    const seen  = new Set();
    let m;

    // Full-resolution image URLs embedded in Google's JSON
    const RE = /\["(https?:\/\/(?!(?:encrypted-tbn|lh\d|gstatic))[^"\s\\]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)",\s*(\d+),\s*(\d+)/gi;
    while ((m = RE.exec(html)) !== null && items.length < 20) {
      const [, u, w, h] = m;
      if (!seen.has(u)) { seen.add(u); items.push({ title: query, image: u, thumbnail: u, url: '', width: +w, height: +h, source: 'google' }); }
    }

    // Fallback: any product CDN URL found directly in the HTML
    if (items.length < 4) {
      const CDN_RE = /"(https:\/\/(?:media-amazon\.com|rukminim\d*\.flixcart\.com|media\.croma\.com|jiomart\.com\/images)[^"]+\.(?:jpg|jpeg|png|webp))"/gi;
      while ((m = CDN_RE.exec(html)) !== null && items.length < 20) {
        if (!seen.has(m[1])) { seen.add(m[1]); items.push({ title: query, image: m[1], thumbnail: m[1], url: '', width: 500, height: 500, source: 'google' }); }
      }
    }
    return items;
  } catch { return []; }
}

// ─── Ranker ───────────────────────────────────────────────────────────────────

const SOURCE_PRIORITY = { google_cse: 90, amazon: 80, flipkart: 80, google: 30 };

function rankCandidates(rawResults, { cleanName, models, brand }) {
  const qTokens    = tokenise(cleanName);
  const bTokens    = tokenise(brand);
  const brandPhrase = brand.toLowerCase().trim();
  const nbTokens   = [...qTokens].filter(
    t => !bTokens.has(t) &&
         !/^(the|and|for|with|pro|max|plus|gb|tb|buy|india|official|product|image|online|best|price|new|get)$/.test(t)
  );

  const scored    = [];
  const seenImg   = new Set();
  const seenTitle = new Set();

  for (const item of rawResults) {
    const imgUrl = item.image || item.thumbnail;
    if (!imgUrl || !/^https?:\/\//i.test(imgUrl)) continue;
    if (/\.svg(?:\.png)?/i.test(imgUrl)) continue;

    const imgKey = imgUrl.split('?')[0].split('/').pop().toLowerCase();
    if (seenImg.has(imgKey)) continue;
    seenImg.add(imgKey);

    const titleRaw    = String(item.title || '');
    const titleLow    = titleRaw.toLowerCase();
    const titleTokens = tokenise(titleRaw);

    const tKey = titleLow.slice(0, 40);
    if (seenTitle.has(tKey) && scored.length >= 6) continue;
    seenTitle.add(tKey);

    let score        = 0;
    let modelMatched = false;

    // ① Source trust score
    score += SOURCE_PRIORITY[item.source] || 0;

    // ② CDN auto-boost (marketplace product CDN)
    const isCDN = PRODUCT_CDN.test(imgUrl);
    if (isCDN) score += 70;

    // ③ Brand phrase match (full phrase beats individual tokens)
    if (brandPhrase && titleLow.includes(brandPhrase)) score += 40;
    else for (const b of bTokens) if (titleTokens.has(b)) score += 15;

    // ④ Model number: word-token in title OR substring in image URL
    for (const model of models) {
      const ml = model.toLowerCase();
      if (titleTokens.has(ml))          { score += 60; modelMatched = true; }
      if (imgUrl.toLowerCase().includes(ml)) { score += 20; modelMatched = true; }
    }

    // ⑤ Non-brand token overlap (WORD tokens, not substring)
    let nbCount = 0;
    for (const t of qTokens) {
      if (titleTokens.has(t)) {
        score += 8;
        if (nbTokens.includes(t)) nbCount++;
      }
    }

    // ⑥ Hard skip: no product-specific tokens match AND not a CDN image
    if (nbTokens.length >= 2 && nbCount === 0 && !isCDN && item.source !== 'google_cse') continue;

    // ⑦ Irrelevant content penalty
    if (IRRELEVANT.test(titleLow)) score -= 150;

    // ⑧ Commercial intent bonus
    if (/\b(buy|shop|price|deal|review|spec|unbox|official|flipkart|amazon|croma|bestbuy|snapdeal|myntra|jiomart)\b/i.test(titleLow)) score += 15;

    // ⑨ Aspect ratio (square = product photo)
    if (item.width && item.height) {
      const r = item.width / item.height;
      if (r >= 0.6 && r <= 1.6)                score += 12;
      if (item.width >= 300 && item.height >= 300) score += 10;
    }

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
      isMarketplace: isCDN || ['google_cse', 'amazon', 'flipkart'].includes(item.source),
      modelMatched,
      score,
      width:  item.width  || null,
      height: item.height || null,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

async function searchProductImages({ productName = '', brand = '', category = '', description = '' }) {
  const cleanName = cleanProductName(productName, brand, description);
  const models    = extractModelNumbers(productName);
  const baseQuery = toQuery(cleanName);
  const shortQ    = baseQuery.split(' ').slice(0, 5).join(' ');

  const queries = [...new Set([
    `${baseQuery} buy`,
    models.length ? `${brand} ${models[0]} buy india`.trim() : null,
    `${baseQuery} india online`,
    category ? `${brand} ${category} buy india`.trim() : null,
  ].filter(Boolean))];

  // All engines × all queries, fully parallel
  const tasks = [];
  for (const q of queries) {
    tasks.push(queryGoogleCSE(q));        // PRIMARY (needs API key)
    tasks.push(scrapeAmazon(q));          // Amazon.in
    tasks.push(scrapeFlipkart(q));        // Flipkart
    tasks.push(scrapeGoogleImages(q));    // Google Images HTML
  }

  const settled    = await Promise.allSettled(tasks);
  const rawResults = settled
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value);

  if (!rawResults.length) {
    return { message: 'No images found. You can upload one instead.', image: null, images: [], isExactMatch: false, isClosestMatch: false };
  }

  const ranked = rankCandidates(rawResults, { cleanName, models, brand });

  if (!ranked.length) {
    return { message: 'No suitable product photos found. You can upload one instead.', image: null, images: [], isExactMatch: false, isClosestMatch: false };
  }

  const best    = ranked[0];
  const isExact = Boolean(best.modelMatched || best.score >= 70);
  const top     = ranked.slice(0, 8);

  return {
    message: isExact ? `Found ${top.length} matching product photos.` : `Found ${top.length} closest matching photos.`,
    isExactMatch: isExact, isClosestMatch: !isExact,
    image: best, images: top,
  };
}

module.exports = { searchProductImages, cleanProductName, extractModelNumbers };
