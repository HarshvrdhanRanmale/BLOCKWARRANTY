const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const { artifact, config } = require('../src/services/blockchain');

(async () => {
  const provider = new ethers.JsonRpcProvider(config.RPC_URL);
  const network = await provider.getNetwork();
  const rpc = new URL(config.RPC_URL);
  if (network.chainId !== 31337n || !['localhost', '127.0.0.1'].includes(rpc.hostname)) {
    throw new Error('Local deployment is restricted to Ganache at localhost on chain 31337.');
  }

  const signer = await provider.getSigner(0);
  const factory = new ethers.ContractFactory(artifact.abi, `0x${artifact.evm.bytecode.object}`, signer);
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  const backendEnv = path.resolve(__dirname, '../.env');
  const frontendEnv = path.resolve(__dirname, '../../frontend/.env');
  const writeValue = (file, key, value) => {
    let contents = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    contents = pattern.test(contents) ? contents.replace(pattern, line) : `${contents.trimEnd()}\n${line}\n`;
    fs.writeFileSync(file, contents);
  };

  writeValue(backendEnv, 'CONTRACT_ADDRESS', address);
  writeValue(frontendEnv, 'VITE_BLOCKWARRANTY_CONTRACT_ADDRESS', address);
  console.log(`Local demo contract deployed at ${address}. Restart the backend to load it.`);
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
