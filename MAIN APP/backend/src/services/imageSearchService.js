/**
 * imageSearchService.js — Electronics Product Image Search (India)
 *
 * Engines (parallel):
 *   1. Google Images  (primary  – best product image index)
 *   2. DuckDuckGo     (secondary)
 *   3. Bing           (tertiary)
 *   4. Yahoo          (fallback)
 *
 * Key design:
 *  • Word-token matching (not substring) — "ac" won't match "actually"
 *  • Brand-phrase matching  — "Blue Star" won't match blue colour palettes
 *  • CDN auto-boost         — Amazon.in / Flipkart / Croma CDN URLs get +80
 *  • No Wikipedia, no direct marketplace scraping (blocked by anti-bot)
 */
'use strict';

// ─── Constants ─────────────────────────────────────────────────────────────

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** Image CDNs that definitively host product photos. */
const PRODUCT_CDN =
  /media-amazon\.com|rukminim\d*\.flixcart\.com|pisces\.bbystatic\.com|bbycastatic|media\.croma\.com|snapdeal\.com\/imagesSubDomain|assets\.myntassets|nykaa\.com\/media|tatacliq|jiomart|reliancedigital|vijaysales|samsung\.com\/image|cdn-apple\.com|store\.storeimages\.cdn-apple|assets\.sony|images\.dell|hp\.com\/content|asus\.com\/media|mi\.com\/assets|realme\.com\/assets|oneplus\.com\/img|gsmarena\.com\/pics|notebookcheck\.net\/fileadmin|cnet\.com\/api\/res|cdn\.mos\.cms\.futurecdn/i;

/** Titles that are clearly not product photos. */
const IRRELEVANT =
  /\b(ripe|fruit|botanical|flora|orchard|garden|food|juice|blossom|schematic|wiring|clipart|cartoon|plant|tree|leaf|animal|dog|cat|bird|insect|stock\s*photo|public\s*domain|free\s*photo|royalty.*free|illustration|wallpaper|color\s*palette|colour\s*palette|hex\s*code|paint\s*swatch|color\s*chart|colour\s*chart|logo|apple\s*store|apple\s*park|apple\s*campus)\b/i;

// ─── Helpers ────────────────────────────────────────────────────────────────

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

  if (brand && !s.toLowerCase().includes(brand.toLowerCase())) {
    s = `${brand} ${s}`;
  }
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

/** Strip brackets so they are not treated as search operators. */
function toQuery(name) {
  return name.replace(/[()[\]{}<>|]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Split a string into a Set of word tokens. */
function tokenise(str = '') {
  return new Set(str.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 1));
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

// ─── Engine 1: Google Images ─────────────────────────────────────────────────

async function queryGoogleImages(query) {
  try {
    const url =
      `https://www.google.com/search?q=${encodeURIComponent(query)}` +
      `&tbm=isch&safe=off&hl=en&num=20&gl=in`;
    const res = await safeFetch(url, {
      timeout: 10000,
      extra: {
        Referer: 'https://www.google.com/',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'navigate',
      },
    });
    if (!res) return [];
    const html = await res.text();

    const items = [];
    const seen  = new Set();

    // Pattern: original-resolution image URLs embedded in Google's JSON
    // Matches ["https://example.com/img.jpg",800,600] or ["https://...",800,600,...]
    const RE = /\["(https?:\/\/(?!(?:encrypted-tbn|lh\d\.google|gstatic\.com))[^"\s\\]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)",\s*(\d+),\s*(\d+)/gi;
    let m;
    while ((m = RE.exec(html)) !== null && items.length < 25) {
      const [, imgUrl, w, h] = m;
      if (seen.has(imgUrl)) continue;
      seen.add(imgUrl);
      items.push({ title: query, image: imgUrl, thumbnail: imgUrl, url: '', width: +w, height: +h, source: 'google' });
    }

    // Fallback: pull any full CDN product URL directly mentioned in HTML
    if (items.length < 5) {
      const CDN_RE = /"(https:\/\/(?:media-amazon\.com|rukminim\d*\.flixcart\.com|media\.croma\.com|jiomart\.com\/images)[^"]+\.(?:jpg|jpeg|png|webp))"/gi;
      while ((m = CDN_RE.exec(html)) !== null && items.length < 25) {
        if (!seen.has(m[1])) { seen.add(m[1]); items.push({ title: query, image: m[1], thumbnail: m[1], url: '', width: 500, height: 500, source: 'google' }); }
      }
    }
    return items;
  } catch {
    return [];
  }
}

// ─── Engine 2: DuckDuckGo ────────────────────────────────────────────────────

async function queryDuckDuckGoImages(query) {
  try {
    const H = { Referer: 'https://duckduckgo.com/' };
    const landing = await safeFetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`,
      { timeout: 9000, extra: H }
    );
    if (!landing) return [];
    const html = await landing.text();

    let vqd = null;
    for (const p of [/vqd=["']?([^"'>&\s\]]+)/, /"vqd":"([^"]+)"/, /vqd:"([^"]+)"/, /data-vqd="([^"]+)"/]) {
      const mm = html.match(p);
      if (mm?.[1]?.length > 3) { vqd = mm[1]; break; }
    }
    if (!vqd) return [];

    const api = await safeFetch(
      `https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&o=json&p=1&vqd=${encodeURIComponent(vqd)}&l=us-en&f=,,,,,`,
      { timeout: 10000, extra: { ...H, Accept: 'application/json,*/*' } }
    );
    if (!api) return [];
    const data = await api.json().catch(() => null);
    if (!Array.isArray(data?.results)) return [];
    return data.results.slice(0, 25).filter(r => r.image).map(r => ({
      title: r.title || query, image: r.image, thumbnail: r.thumbnail || r.image,
      url: r.url || '', width: r.width || 0, height: r.height || 0, source: 'duckduckgo',
    }));
  } catch { return []; }
}

// ─── Engine 3: Bing Images ──────────────────────────────────────────────────

async function queryBingImages(query) {
  try {
    const res = await safeFetch(
      `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=1`,
      { timeout: 10000, extra: { Referer: 'https://www.bing.com/' } }
    );
    if (!res) return [];
    const html = await res.text();

    const items = [];
    const seen  = new Set();
    const add   = (img, title, thumb, pageUrl, w, h) => {
      if (!img || !/^https?:\/\//i.test(img) || seen.has(img)) return;
      seen.add(img);
      items.push({ title: title || query, image: img, thumbnail: thumb || img, url: pageUrl || '', width: w || 0, height: h || 0, source: 'bing' });
    };
    let m;
    for (const pat of [/m="({[^"]+})"/g, /data-m="({[^"]+})"/g]) {
      while ((m = pat.exec(html)) !== null) {
        try { const j = JSON.parse(m[1].replace(/&quot;/g, '"')); if (j.murl) add(j.murl, j.t || j.desc, j.turl, j.purl, j.mw, j.mh); } catch {}
      }
    }
    // Direct CDN fallback
    const cdn = /"(https:\/\/(?:media-amazon\.com|rukminim\d*\.flixcart\.com|media\.croma\.com|jiomart\.com\/images)[^"]+\.(?:jpg|jpeg|png|webp))"/gi;
    while ((m = cdn.exec(html)) !== null) add(m[1], query, m[1], '', 500, 500);

    return items.slice(0, 30);
  } catch { return []; }
}

// ─── Engine 4: Yahoo Images ─────────────────────────────────────────────────

async function queryYahooImages(query) {
  try {
    const res = await safeFetch(
      `https://images.search.yahoo.com/search/images?p=${encodeURIComponent(query)}&fr=yfp-t`,
      { timeout: 9000, extra: { Referer: 'https://images.search.yahoo.com/' } }
    );
    if (!res) return [];
    const html = await res.text();
    const items = []; const seen = new Set(); let m;
    const RE = /"origUrl":"([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi;
    while ((m = RE.exec(html)) !== null && items.length < 20) {
      const url = m[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/');
      if (/^https?:\/\//i.test(url) && !seen.has(url) && !/s\.yimg\./i.test(url)) {
        seen.add(url);
        items.push({ title: query, image: url, thumbnail: url, url: '', width: 0, height: 0, source: 'yahoo' });
      }
    }
    return items;
  } catch { return []; }
}

// ─── Ranker ─────────────────────────────────────────────────────────────────

function rankCandidates(rawResults, { cleanName, models, brand }) {
  // ── Tokenise query ──────────────────────────────────────────────────────
  const qTokens = tokenise(cleanName);               // all query word-tokens
  const bTokens = tokenise(brand);                   // brand word-tokens
  // Non-brand tokens that carry product-specific meaning
  const nbTokens = [...qTokens].filter(
    t => !bTokens.has(t) &&
    !/^(the|and|for|with|pro|max|plus|gb|tb|buy|india|official|product|image|online|best|price|new)$/.test(t)
  );

  // Full brand phrase (e.g. "blue star") for phrase-level matching
  const brandPhrase = brand.toLowerCase().trim();

  const scored     = [];
  const seenImg    = new Set();
  const seenTitle  = new Set();

  for (const item of rawResults) {
    const imgUrl = item.image || item.thumbnail;
    if (!imgUrl || !/^https?:\/\//i.test(imgUrl)) continue;
    if (/\.svg(?:\.png)?/i.test(imgUrl)) continue;

    // Dedup by filename
    const imgKey = imgUrl.split('?')[0].split('/').pop().toLowerCase();
    if (seenImg.has(imgKey)) continue;
    seenImg.add(imgKey);

    const titleRaw = String(item.title || '');
    const titleLow = titleRaw.toLowerCase();

    // Dedup by title prefix
    const tKey = titleLow.slice(0, 40);
    if (seenTitle.has(tKey) && scored.length >= 6) continue;
    seenTitle.add(tKey);

    const titleTokens = tokenise(titleRaw);        // word-tokens in title
    const imgUrlLow   = imgUrl.toLowerCase();

    let score        = 0;
    let modelMatched = false;

    // ① CDN auto-boost
    const isCDN = PRODUCT_CDN.test(imgUrl);
    if (isCDN) score += 80;

    // ② Brand PHRASE match (e.g. "blue star" appears together in title)
    //    Much more reliable than checking each token separately
    if (brandPhrase && titleLow.includes(brandPhrase)) score += 40;
    else {
      // Partial: individual brand tokens (half credit)
      for (const b of bTokens) {
        if (titleTokens.has(b)) score += 15;
      }
    }

    // ③ Model number: word-token match in title, or substring in image URL
    for (const model of models) {
      const m = model.toLowerCase();
      if (titleTokens.has(m))     { score += 60; modelMatched = true; }
      if (imgUrlLow.includes(m))  { score += 20; modelMatched = true; }
    }

    // ④ Non-brand query token overlap (word-token, not substring)
    let nbCount = 0;
    for (const t of qTokens) {
      if (titleTokens.has(t)) {
        score += 8;
        if (nbTokens.includes(t)) nbCount++;
      }
    }

    // ⑤ Hard skip: no non-brand tokens matched AND not a CDN image
    //    Only fires when there are enough meaningful tokens (≥ 2) to check
    if (nbTokens.length >= 2 && nbCount === 0 && !isCDN) continue;

    // ⑥ Irrelevant content penalty
    if (IRRELEVANT.test(titleLow)) score -= 150;

    // ⑦ Brand-only title with no product words → penalise
    //    "Apple" or "Blue" in title but no model / product keyword
    if (brandPhrase && titleTokens.has(brandPhrase.split(' ')[0]) && nbCount === 0 && !isCDN) {
      score -= 80;
    }

    // ⑧ Commercial-intent bonus
    if (/\b(buy|shop|price|deal|review|spec|unbox|official|flipkart|amazon|croma|bestbuy|snapdeal|myntra|jiomart)\b/i.test(titleLow)) score += 15;

    // ⑨ Aspect-ratio bonus
    if (item.width && item.height) {
      const r = item.width / item.height;
      if (r >= 0.6 && r <= 1.6)           score += 12;
      if (item.width >= 300 && item.height >= 300) score += 10;
    }

    // Gate
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
      isMarketplace: isCDN,
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
  const cleanName  = cleanProductName(productName, brand, description);
  const models     = extractModelNumbers(productName);
  const baseQuery  = toQuery(cleanName);
  const shortQuery = baseQuery.split(' ').slice(0, 5).join(' ');

  const queries = [...new Set([
    `${baseQuery} buy`,
    models.length ? `${brand} ${models[0]} buy india`.trim() : null,
    `${baseQuery} flipkart OR amazon india`,
    `${shortQuery} official product image`,
    category ? `${brand} ${category} buy india`.trim() : null,
  ].filter(Boolean))];

  // All engines × all queries, fully parallel
  const tasks = [];
  for (const q of queries) {
    tasks.push(queryGoogleImages(q));
    tasks.push(queryDuckDuckGoImages(q));
    tasks.push(queryBingImages(q));
    tasks.push(queryYahooImages(q));
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
