const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const publicProductRoutes = require('./routes/publicProductRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const blockchainRoutes = require('./routes/blockchainRoutes').router;
const config = require('./config/env');

const app = express();
const appOrigins = [config.FRONTEND_URL, config.PUBLIC_DEMO_ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:5173'].filter(Boolean);
// Embedded wallets run their JSON-RPC client inside Web3Auth / MetaMask hosted
// frames. The provider can select a regional or versioned subdomain, so allow
// only their HTTPS domains instead of pinning one frame URL.
const isEmbeddedWalletOrigin = (origin) => (
  /^https:\/\/(?:[a-z0-9-]+\.)*(?:web3auth\.io|metamask\.io)$/i.test(origin || '')
);
const isQuickTunnelOrigin = (origin) => config.NODE_ENV !== 'production' && /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/i.test(origin || '');
const isAllowedAppOrigin = (origin) => appOrigins.includes(origin) || isEmbeddedWalletOrigin(origin) || isQuickTunnelOrigin(origin);

// Security headers
app.use(helmet());

// Cross-origin configuration
app.use(
  cors({
    origin(origin, callback) {
      callback(null, !origin || isAllowedAppOrigin(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);

// Body parser
app.use(express.json({ limit: '25mb' }));

// Web3Auth may run in an isolated browser context that cannot access the
// host's localhost RPC port. This narrow relay is development-only and only
// exposes read methods plus already-signed transactions to local Ganache.
const localRpcMethods = new Set([
  'eth_chainId', 'net_version', 'eth_blockNumber', 'eth_getBlockByNumber',
  'eth_getBlockByHash', 'eth_getTransactionCount', 'eth_getBalance', 'eth_getCode',
  'eth_call', 'eth_estimateGas', 'eth_gasPrice', 'eth_maxPriorityFeePerGas',
  'eth_feeHistory', 'eth_sendRawTransaction', 'eth_getTransactionByHash',
  'eth_getTransactionReceipt', 'eth_getLogs', 'eth_getStorageAt'
]);
const rpcRequests = new Map();
app.post('/api/blockchain/rpc', async (req, res) => {
  const rpcUrl = new URL(config.RPC_URL);
  const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(rpcUrl.hostname);
  if (config.NODE_ENV === 'production' || config.BLOCKCHAIN_CHAIN_ID !== 31337 || !isLoopback) {
    return res.status(404).json({ message: 'Local demo RPC relay is unavailable.' });
  }
  const origin = req.get('origin');
  const remote = req.socket.remoteAddress || '';
  if (!isAllowedAppOrigin(origin) || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) {
    console.warn(`[BlockWarranty] Blocked local demo RPC request from origin: ${origin || 'none'}`);
    return res.status(403).json({ message: 'Local demo RPC requests must come from this computer and the BlockWarranty app.' });
  }
  const now = Date.now();
  const windowStart = now - 60_000;
  const prior = (rpcRequests.get(remote) || []).filter((time) => time > windowStart);
  if (prior.length >= 240) return res.status(429).json({ message: 'Too many local demo RPC requests.' });
  prior.push(now);
  rpcRequests.set(remote, prior);
  const payload = req.body;
  if (!payload || Array.isArray(payload) || payload.jsonrpc !== '2.0' || typeof payload.method !== 'string' || !localRpcMethods.has(payload.method) || !Array.isArray(payload.params || [])) {
    return res.status(400).json({ jsonrpc: '2.0', id: payload?.id ?? null, error: { code: -32601, message: 'RPC method is not allowed by the local demo relay.' } });
  }
  if (JSON.stringify(payload).length > 16_384) return res.status(413).json({ message: 'RPC request is too large.' });
  try {
    const upstream = await fetch(config.RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000)
    });
    const body = await upstream.text();
    if (body.length > 2_000_000) return res.status(502).json({ message: 'RPC response exceeds the demo relay limit.' });
    return res.status(upstream.status).type('application/json').send(body);
  } catch {
    return res.status(502).json({ message: 'The local demo blockchain is not running.' });
  }
});

// Healthcheck
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'blockwarranty-auth-backend',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'unavailable',
    timestamp: new Date().toISOString()
  });
});

app.get('/health/ready', (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ status: 'unavailable', database: 'disconnected' });
  }
  return res.json({ status: 'ready', database: 'connected' });
});

// Authentication routes
app.use('/api/auth', authRoutes);
app.use('/api/public/products', publicProductRoutes);
app.use('/api/products/:productId/services', serviceRoutes);
app.use('/api/products/:productId/blockchain', blockchainRoutes);
app.use('/api/products', productRoutes);

// Multi-engine marketplace product image search
const { searchProductImages } = require('./services/imageSearchService');

app.get('/api/product-image', async (req, res) => {
  const productName = String(req.query.productName || '').trim().slice(0, 200);
  const brand = String(req.query.brand || '').trim().slice(0, 100);
  const category = String(req.query.category || '').trim().slice(0, 50);

  if (!productName) {
    return res.status(400).json({ message: 'Product name is required for image search.' });
  }

  try {
    const result = await searchProductImages({ productName, brand, category });
    return res.json(result);
  } catch (error) {
    console.error('Product image lookup failed:', error.message);
    return res.status(502).json({
      message: 'Product image search is temporarily unavailable. You can upload an image instead.',
      image: null,
      images: []
    });
  }
});

// Invoice extraction is deliberately stateless and does not use MongoDB.
app.post('/api/extract-invoice', async (req, res) => {
  const { fileName, fileType, fileData } = req.body || {};
  const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

  if (fileType === 'application/pdf') {
    return res.status(415).json({
      message: 'Groq image extraction currently accepts JPG or PNG invoices. Please convert this PDF to an image and upload it again.'
    });
  }
  if (!supportedTypes.includes(fileType) || typeof fileData !== 'string' || !fileData) {
    return res.status(400).json({ message: 'Upload a JPG, PNG, or WEBP invoice image.' });
  }
  const normalizedFileType = fileType === 'image/jpg' ? 'image/jpeg' : fileType;
  if (Buffer.byteLength(fileData, 'base64') > 10 * 1024 * 1024) {
    return res.status(413).json({ message: 'Invoice image must be 10 MB or smaller.' });
  }
  if (!process.env.GROQ_API_KEY) {
    return res.status(503).json({ message: 'Groq invoice extraction needs your settings. Fill in GROQ_API_KEY and GROQ_MODEL in backend/.env, then restart the backend and retry.' });
  }

  const fields = [
    'productName', 'brand', 'category', 'purchaseDate', 'warrantyPeriod', 'warrantyUnit',
    'invoiceNumber', 'currency', 'unitPrice', 'quantity', 'lineItemAmount', 'subtotal',
    'discount', 'shippingCost', 'tax', 'total', 'amountPaid', 'balanceDue', 'description'
  ];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'qwen/qwen3.8-27b',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Extract the invoice details from this image. Return one JSON object with exactly these string fields: ${fields.join(', ')}. Return only values clearly supported by the invoice. Use an empty string for missing or uncertain values. Dates must be YYYY-MM-DD. Numeric values should contain digits and a decimal point only. Choose category from Laptop, Smartphone, Headphones, Smartwatch, Tablet, Electronics, Software, or Other. Warranty period should be a number and warrantyUnit should be Years or Months.`
            },
              { type: 'image_url', image_url: { url: `data:${normalizedFileType};base64,${fileData}` } }
          ]
        }]
      })
    });
    const result = await groqResponse.json().catch(() => ({}));
    if (!groqResponse.ok) {
      const providerMessage = String(result.error?.message || result.message || 'No details returned by Groq.')
        .replaceAll(process.env.GROQ_API_KEY, '[redacted]')
        .slice(0, 500);
      console.error('Groq invoice API error:', groqResponse.status, providerMessage);
      const message = groqResponse.status === 401 || groqResponse.status === 403
        ? `Groq rejected the configured API key or permissions: ${providerMessage}`
        : groqResponse.status === 429
          ? `Groq rate limit reached: ${providerMessage}`
          : `Groq rejected this invoice request (${groqResponse.status}): ${providerMessage}`;
      return res.status(groqResponse.status >= 400 && groqResponse.status < 500 ? groqResponse.status : 502).json({ message });
    }

    const content = result.choices?.[0]?.message?.content;
    const extractedData = typeof content === 'string' ? JSON.parse(content) : null;
    if (!extractedData || typeof extractedData !== 'object') throw new Error('Groq returned no invoice fields.');
    return res.json({ message: 'Invoice details extracted.', fileName: fileName || '', fileType: normalizedFileType, extractedData });
  } catch (error) {
    console.error('Groq invoice request failed:', error.name, error.message);
    const message = error.name === 'AbortError'
      ? 'Groq took too long to process this invoice. Please retry.'
      : error instanceof SyntaxError
        ? 'Groq returned an unreadable result. Please retry the extraction.'
        : error.name === 'TypeError'
          ? 'Could not connect to Groq. Check the backend internet connection and retry.'
          : 'Invoice extraction failed. Please retry or enter the details manually.';
    return res.status(502).json({ message });
  } finally {
    clearTimeout(timeout);
  }
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.url} not found`
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

module.exports = app;
