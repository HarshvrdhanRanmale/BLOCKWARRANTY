const { ethers } = require('ethers');
const { artifact, config } = require('../src/services/blockchain');

// The contract now requires an initial relayer address in its constructor.
// Derive it from RELAYER_PRIVATE_KEY (preferred, guarantees address match with
// the backend relayer service) or an explicit RELAYER_ADDRESS.
function resolveRelayerAddress() {
  if (process.env.RELAYER_PRIVATE_KEY) {
    try {
      return new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY).address;
    } catch {
      throw new Error('RELAYER_PRIVATE_KEY in backend/.env is not a valid private key.');
    }
  }
  if (process.env.RELAYER_ADDRESS) {
    if (!ethers.isAddress(process.env.RELAYER_ADDRESS)) throw new Error('RELAYER_ADDRESS is not a valid address.');
    return process.env.RELAYER_ADDRESS;
  }
  throw new Error('Set RELAYER_PRIVATE_KEY (preferred) or RELAYER_ADDRESS in backend/.env before deploying — the BlockWarranty constructor now requires an initial relayer.');
}

(async () => {
  const network = await new ethers.JsonRpcProvider(config.RPC_URL).getNetwork();
  if (network.chainId !== 11155111n) throw new Error(`Refusing deployment: expected Sepolia (11155111), got chain ${network.chainId}.`);
  const privateKey = process.env.SEPOLIA_DEPLOYER_PRIVATE_KEY;
  if (!privateKey) throw new Error('Set SEPOLIA_DEPLOYER_PRIVATE_KEY in backend/.env to a Sepolia-funded deployer wallet.');
  const relayer = resolveRelayerAddress();
  if (!ethers.isAddress(config.CONTRACT_ADDRESS) || config.CONTRACT_ADDRESS === ethers.ZeroAddress) {
    throw new Error('Set the current legacy CONTRACT_ADDRESS in backend/.env before deploying the migration-enabled contract.');
  }
  if (!process.env.RELAYER_PRIVATE_KEY) {
    throw new Error('Set a dedicated RELAYER_PRIVATE_KEY in backend/.env before deploying automatic transfer support.');
  }
  const provider = new ethers.JsonRpcProvider(config.RPC_URL, 11155111);
  const signer = new ethers.Wallet(privateKey, provider);
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
  const contract = await factory.deploy(relayer, config.CONTRACT_ADDRESS); await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`Contract deployed at ${address} on chain ${await provider.getNetwork().then((n) => n.chainId)}.`);
  console.log(`Initial relayer: ${relayer}`);
  console.log(`Set CONTRACT_ADDRESS=${address} in backend/.env and VITE_BLOCKWARRANTY_CONTRACT_ADDRESS=${address} in frontend/.env.`);
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
