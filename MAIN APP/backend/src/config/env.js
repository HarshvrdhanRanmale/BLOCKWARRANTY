const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

module.exports = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  JWT_SECRET: process.env.JWT_SECRET || 'blockwarranty_dev_jwt_secret_key_987654321',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
  RPC_URL: process.env.RPC_URL || 'http://127.0.0.1:8545',
  BLOCKCHAIN_CHAIN_ID: parseInt(process.env.BLOCKCHAIN_CHAIN_ID || '31337', 10),
  CONTRACT_ADDRESS: process.env.CONTRACT_ADDRESS || '',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  PUBLIC_DEMO_ORIGIN: process.env.PUBLIC_DEMO_ORIGIN || '',
  CHALLENGE_TTL_MS: 10 * 60 * 1000, // 10 minutes
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/blockwarranty?directConnection=true'
};
