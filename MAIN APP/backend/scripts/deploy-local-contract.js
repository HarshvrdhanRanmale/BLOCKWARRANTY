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

  // The BlockWarranty constructor now requires an initial relayer address.
  // Prefer RELAYER_PRIVATE_KEY (matches the backend relayer service exactly);
  // fall back to RELAYER_ADDRESS, then to the deployer address with a warning.
  let relayerAddress;
  if (process.env.RELAYER_PRIVATE_KEY) {
    try {
      relayerAddress = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY).address;
    } catch {
      throw new Error('RELAYER_PRIVATE_KEY in backend/.env is not a valid private key.');
    }
  } else if (process.env.RELAYER_ADDRESS) {
    if (!ethers.isAddress(process.env.RELAYER_ADDRESS)) throw new Error('RELAYER_ADDRESS is not a valid address.');
    relayerAddress = process.env.RELAYER_ADDRESS;
  } else {
    relayerAddress = await signer.getAddress();
    console.warn(`Warning: RELAYER_PRIVATE_KEY not set — using the deployer ${relayerAddress} as initial relayer. Automatic transfers will be disabled until a dedicated relayer key is configured.`);
  }

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
  const contract = await factory.deploy(relayerAddress, config.CONTRACT_ADDRESS || ethers.ZeroAddress);
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
  console.log(`Local demo contract deployed at ${address} (initial relayer: ${relayerAddress}). Restart the backend to load it.`);
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
