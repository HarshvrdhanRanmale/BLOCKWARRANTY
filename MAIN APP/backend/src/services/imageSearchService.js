/**
 * imageSearchService.js — Electronics Product Image Search (India)
 *
 * Engines (parallel):
 *   1. Google Custom Search Image API (primary when GOOGLE_API_KEY + GOOGLE_CSE_ID are set)
 *   2. Flipkart scraper (direct 832×832 product photos with exact model & color titles)
 *   3. DuckDuckGo Image Search (Indian e-commerce & retail marketplace photos)
 *   4. Google Images scraper (fallback CDN extractor)
 *
 * NO Wikipedia. NO Fruit/Logo/Color palette leakage. NO Accessories/Cases.
 */
'use strict';

// ─── CDN / irrelevant / accessory patterns ────────────────────────────────────

const PRODUCT_CDN =
  /media-amazon\.com|rukminim\d*\.flixcart\.com|pisces\.bbystatic\.com|bbycastatic|media\.croma\.com|snapdeal\.com\/imagesSubDomain|assets\.myntassets|nykaa\.com\/media|tatacliq|jiomart\.com\/images|reliancedigital|vijaysales|samsung\.com\/image|cdn-apple\.com|store\.storeimages\.cdn-apple|assets\.sony|images\.dell|hp\.com\/content|asus\.com\/media|mi\.com\/assets|realme\.com\/assets|oneplus\.com\/img|gsmarena\.com\/pics|notebookcheck\.net\/fileadmin|cnet\.com\/api\/res|cdn\.mos\.cms\.futurecdn/i;

const IRRELEVANT =
  /\b(ripe|fruit|botanical|flora|orchard|garden|food|juice|blossom|schematic|wiring|clipart|cartoon|plant|tree|leaf|animal|dog|cat|bird|insect|stock\s*photo|public\s*domain|free\s*photo|royalty.*free|illustration|wallpaper|color\s*palette|colour\s*palette|hex\s*code|paint\s*swatch|color\s*chart|colour\s*chart|logo|apple\s*store|apple\s*park|apple\s*campus)\b/i;

const ACCESSORY =
  /\b(case|cover|back\s*panel|back\s*glass|housing|lens\s*protector|screen\s*guard|tempered\s*glass|skin|sticker|pouch|sleeve|bumper|keychain|wristband|strap|charger\s*cable|cable|converter|dock)\b/i;

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

async function safeFetch(url, { timeout = 8000, extra = {} } = {}) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'en-IN,en-US;q=0.9,en;q=0.8',
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

// ─── Engine 1: Google Custom Search Image API ─────────────────────────────────

async function queryGoogleCSE(query) {
  const apiKey = process.env.GOOGLE_API_KEY;
  const cseId  = process.env.GOOGLE_CSE_ID;
  if (!apiKey || !cseId) return [];

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
  } catch {
    return [];
  }
}

// ─── Engine 2: Flipkart Scraper (Direct 832×832 Photos) ───────────────────────

async function scrapeFlipkart(query) {
  try {
    const res = await safeFetch(
      `https://www.flipkart.com/search?q=${encodeURIComponent(query)}&otracker=search&as=off`,
      { timeout: 8000, extra: { Referer: 'https://www.flipkart.com/' } }
    );
    if (!res) return [];
    const html = await res.text();

    const items = [];
    const seen  = new Set();
    const re    = /<img[^>]+alt=["']([^"']+)["'][^>]+src=["'](https:\/\/rukminim\d*\.flixcart\.com\/image\/\d+\/\d+\/[^"']+)["']/gi;
    let m;
    while ((m = re.exec(html)) !== null && items.length < 15) {
      const title   = m[1].trim();
      const fullUrl = m[2].replace(/\/\d+\/\d+\//, '/832/832/').replace(/\?.*$/, '');
      if (!seen.has(fullUrl)) {
        seen.add(fullUrl);
        items.push({
          title,
          image:     fullUrl,
          thumbnail: fullUrl,
          url:       'https://www.flipkart.com',
          width:     832,
          height:    832,
          source:    'flipkart',
        });
      }
    }
    return items;
  } catch {
    return [];
  }
}

// ─── Engine 3: DuckDuckGo Marketplace Image API ───────────────────────────────

async function scrapeDuckDuckGo(query) {
  try {
    const tokenRes = await safeFetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iar=images&iax=images&ia=images`,
      { timeout: 6000 }
    );
    if (!tokenRes) return [];
    const tokenText = await tokenRes.text();
    const vqdMatch = tokenText.match(/vqd=["']?([^&"'\s]+)/);
    if (!vqdMatch) return [];

    const imgRes = await safeFetch(
      `https://duckduckgo.com/i.js?l=in-en&o=json&q=${encodeURIComponent(query)}&vqd=${vqdMatch[1]}&f=,,,type:photo,&p=1`,
      { timeout: 7000, extra: { Referer: 'https://duckduckgo.com/' } }
    );
    if (!imgRes) return [];
    const data = await imgRes.json().catch(() => null);
    if (!Array.isArray(data?.results)) return [];

    return data.results.slice(0, 15).map(r => ({
      title:     r.title || query,
      image:     r.image,
      thumbnail: r.thumbnail || r.image,
      url:       r.url || '',
      width:     r.width || 0,
      height:    r.height || 0,
      source:    'duckduckgo',
    }));
  } catch {
    return [];
  }
}

// ─── Engine 4: Google Images HTML Fallback ───────────────────────────────────

async function scrapeGoogleImages(query) {
  try {
    const res = await safeFetch(
      `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch&safe=off&hl=en&num=20&gl=in`,
      { timeout: 8000, extra: { Referer: 'https://www.google.com/' } }
    );
    if (!res) return [];
    const html = await res.text();

    const items = [];
    const seen  = new Set();
    let m;

    const RE = /\["(https?:\/\/(?!(?:encrypted-tbn|lh\d|gstatic))[^"\s\\]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)",\s*(\d+),\s*(\d+)/gi;
    while ((m = RE.exec(html)) !== null && items.length < 15) {
      const [, u, w, h] = m;
      if (!seen.has(u)) { seen.add(u); items.push({ title: query, image: u, thumbnail: u, url: '', width: +w, height: +h, source: 'google' }); }
    }

    if (items.length < 4) {
      const CDN_RE = /"(https:\/\/(?:media-amazon\.com|rukminim\d*\.flixcart\.com|media\.croma\.com|jiomart\.com\/images)[^"]+\.(?:jpg|jpeg|png|webp))"/gi;
      while ((m = CDN_RE.exec(html)) !== null && items.length < 15) {
        if (!seen.has(m[1])) { seen.add(m[1]); items.push({ title: query, image: m[1], thumbnail: m[1], url: '', width: 500, height: 500, source: 'google' }); }
      }
    }
    return items;
  } catch {
    return [];
  }
}

// ─── Ranker ───────────────────────────────────────────────────────────────────

const SOURCE_PRIORITY = { google_cse: 95, flipkart: 90, duckduckgo: 80, google: 40 };

function rankCandidates(rawResults, { cleanName, models, brand }) {
  const qTokens     = tokenise(cleanName);
  const bTokens     = tokenise(brand);
  const brandPhrase = brand.toLowerCase().trim();
  const nbTokens    = [...qTokens].filter(
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

    // ③ Brand phrase match (full phrase beats individual words)
    if (brandPhrase && titleLow.includes(brandPhrase)) score += 40;
    else for (const b of bTokens) if (titleTokens.has(b)) score += 15;

    // ④ Model number: word-token in title OR substring in image URL
    for (const model of models) {
      const ml = model.toLowerCase();
      if (titleTokens.has(ml))               { score += 60; modelMatched = true; }
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

    // ⑦ Irrelevant content penalty (fruits, color charts, wallpaper)
    if (IRRELEVANT.test(titleLow)) score -= 150;

    // ⑧ Accessory penalty (cases, screen guards, back panels) unless explicitly searched
    if (ACCESSORY.test(titleLow) && !qTokens.has('case') && !qTokens.has('cover') && !qTokens.has('panel')) {
      score -= 120;
    }

    // ⑨ Aspect ratio (square = product photo)
    if (item.width && item.height) {
      const r = item.width / item.height;
      if (r >= 0.6 && r <= 1.6)                    score += 12;
      if (item.width >= 300 && item.height >= 300) score += 10;
    }

    if (score <= 0) continue;

    let domain = '';
    try { domain = new URL(item.url || imgUrl).hostname.replace(/^www\./, ''); } catch {}

    scored.push({
      title:         item.title || cleanName,
      imageUrl:      imgUrl,
      thumbnailUrl:  item.thumbnail || imgUrl,
      sourceUrl:     item.url || '',
      domain,
      sourceLabel:   item.source || domain || 'Web',
      isMarketplace: isCDN || ['google_cse', 'flipkart', 'duckduckgo'].includes(item.source),
      modelMatched,
      score,
      width:         item.width  || null,
      height:        item.height || null,
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

  const queries = [...new Set([
    baseQuery,
    models.length ? `${brand} ${models[0]} buy`.trim() : null,
    `${baseQuery} india`,
    category ? `${brand} ${category} india`.trim() : null,
  ].filter(Boolean))];

  // All engines × all queries, fully parallel
  const tasks = [];
  for (const q of queries) {
    tasks.push(queryGoogleCSE(q));      // Engine 1: Google CSE (if configured)
    tasks.push(scrapeFlipkart(q));      // Engine 2: Flipkart (832x832 product photos)
    tasks.push(scrapeDuckDuckGo(q));    // Engine 3: DuckDuckGo Marketplace
    tasks.push(scrapeGoogleImages(q));  // Engine 4: Google Images
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
