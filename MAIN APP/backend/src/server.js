const mongoose = require('mongoose');
const app = require('./app');
const config = require('./config/env');
const { startReconciliation } = require('./services/reconciliation');

async function startServer() {
  try {
    await mongoose.connect(config.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000
    });

    console.log('✅ MongoDB connected.');
    startReconciliation();
  } catch (err) {
    console.warn('⚠️ MongoDB is unavailable; database-backed authentication will not work until it reconnects:', err.message);
  }

  const server = app.listen(config.PORT, () => {
    console.log(`BlockWarranty backend listening on http://localhost:${config.PORT}`);
    console.log(`Health check: http://localhost:${config.PORT}/health`);
  });

  const shutdown = (signal) => {
    console.log(`\n${signal} received — closing server…`);
    server.close(async () => {
      if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
      console.log('Backend stopped.');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  return server;
}

module.exports = startServer();
