// Imports every product known to the existing MongoDB registry into the new
// contract. The new contract reads authoritative product/service/claim state
// directly from migrationSource and only allows its contract owner to import.
// Run manually after deployment; this script submits irreversible Sepolia txs.
const mongoose = require('mongoose');
const { ethers } = require('ethers');
const config = require('../src/config/env');
const Product = require('../src/models/Product');
const { artifact, productKey } = require('../src/services/blockchain');

async function main() {
  const targetAddress = String(process.env.MIGRATION_TARGET_ADDRESS || '').trim();
  const deployerKey = process.env.SEPOLIA_DEPLOYER_PRIVATE_KEY;
  if (!ethers.isAddress(targetAddress)) throw new Error('Set MIGRATION_TARGET_ADDRESS to the newly deployed Sepolia contract.');
  if (!deployerKey) throw new Error('Set SEPOLIA_DEPLOYER_PRIVATE_KEY in backend/.env.');
  if (config.BLOCKCHAIN_CHAIN_ID !== 11155111) throw new Error('Product migration is restricted to Sepolia.');

  const provider = new ethers.JsonRpcProvider(config.RPC_URL, 11155111);
  const network = await provider.getNetwork();
  if (network.chainId !== 11155111n) throw new Error('Configured RPC is not Sepolia.');
  const signer = new ethers.Wallet(deployerKey, provider);
  const target = new ethers.Contract(targetAddress, artifact.abi, signer);
  const migrationSource = (await target.migrationSource()).toLowerCase();
  if (migrationSource !== config.CONTRACT_ADDRESS.toLowerCase()) throw new Error('New contract migrationSource does not match the current CONTRACT_ADDRESS.');
  if ((await target.contractOwner()).toLowerCase() !== signer.address.toLowerCase()) throw new Error('Deployer key is not the new contract owner.');
  const relayerKey = config.RELAYER_PRIVATE_KEY;
  if (!relayerKey || (await target.relayer()).toLowerCase() !== new ethers.Wallet(relayerKey).address.toLowerCase()) {
    throw new Error('New contract relayer does not match RELAYER_PRIVATE_KEY.');
  }

  await mongoose.connect(config.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const rows = await Product.find({}, 'productId').sort({ productId: 1 }).lean();
  const legacy = new ethers.Contract(config.CONTRACT_ADDRESS, artifact.abi, provider);
  let imported = 0;
  let skipped = 0;
  for (const row of rows) {
    const key = productKey(row.productId);
    if (!(await legacy.productExists(key))) { skipped += 1; continue; }
    if (await target.productExists(key)) { skipped += 1; continue; }
    const tx = await target.migrateProduct(key);
    const receipt = await tx.wait(1);
    if (!receipt || receipt.status !== 1 || !(await target.productExists(key))) {
      throw new Error(`Migration did not confirm for product ${row.productId}.`);
    }
    imported += 1;
    console.log(`Imported ${row.productId} in ${receipt.hash}`);
  }
  if (await target.migrationOpen()) {
    const closeTx = await target.closeMigration();
    const closeReceipt = await closeTx.wait(1);
    if (!closeReceipt || closeReceipt.status !== 1 || await target.migrationOpen()) {
      throw new Error('Product import completed, but the migration path could not be closed.');
    }
  }
  console.log(`Migration complete. Imported ${imported}; skipped ${skipped}.`);
  await mongoose.disconnect();
  await provider.destroy();
}

main().catch(async (error) => {
  console.error(error.message);
  if (mongoose.connection.readyState) await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
