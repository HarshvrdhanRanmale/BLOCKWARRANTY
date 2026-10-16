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
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/blockwarranty?directConnection=true',
  // Razorpay Test Mode (UPI). The KEY_SECRET is server-side only and is never
  // sent to the frontend. The KEY_ID is a publishable test key.
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || '',
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || '',
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  // Relayer wallet (server-side only). A dedicated, low-value Sepolia wallet
  // authorized on-chain (via setRelayer) to submit transferOwnershipByRelayer
  // after a verified payment. NEVER a user wallet. Left blank => automatic
  // relayer transfer is disabled and the manual seller MetaMask flow is used.
  RELAYER_PRIVATE_KEY: process.env.RELAYER_PRIVATE_KEY || '',
  SEPOLIA_DEPLOYER_PRIVATE_KEY: process.env.SEPOLIA_DEPLOYER_PRIVATE_KEY || '',
};
