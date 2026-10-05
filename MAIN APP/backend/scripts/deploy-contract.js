const { ethers } = require('ethers');
const { artifact, config } = require('../src/services/blockchain');
(async () => {
  const network = await new ethers.JsonRpcProvider(config.RPC_URL).getNetwork();
  if (network.chainId !== 11155111n) throw new Error(`Refusing deployment: expected Sepolia (11155111), got chain ${network.chainId}.`);
  const privateKey = process.env.SEPOLIA_DEPLOYER_PRIVATE_KEY;
  if (!privateKey) throw new Error('Set SEPOLIA_DEPLOYER_PRIVATE_KEY in backend/.env to a Sepolia-funded deployer wallet.');
  const provider = new ethers.JsonRpcProvider(config.RPC_URL, 11155111);
  const signer = new ethers.Wallet(privateKey, provider);
  const factory = new ethers.ContractFactory(artifact.abi, `0x${artifact.evm.bytecode.object}`, signer);
  const contract = await factory.deploy(); await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`Contract deployed at ${address} on chain ${await provider.getNetwork().then((n) => n.chainId)}.`);
  console.log(`Set CONTRACT_ADDRESS=${address} in backend/.env and VITE_BLOCKWARRANTY_CONTRACT_ADDRESS=${address} in frontend/.env.`);
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
