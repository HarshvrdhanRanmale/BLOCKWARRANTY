const hre = require("hardhat");

async function main() {
  console.log("========================================");
  console.log("       BlockWarranty Deployment");
  console.log("========================================");

  console.log("Network:", hre.network.name);

  const [deployer] = await hre.ethers.getSigners();

  console.log("Deployer Address:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);

  console.log(
    "Deployer Balance:",
    hre.ethers.formatEther(balance),
    "ETH"
  );

  console.log("\nDeploying BlockWarranty...");

  const BlockWarranty = await hre.ethers.getContractFactory(
    "BlockWarranty"
  );

  const [relayer] = await hre.ethers.getSigners();
  const blockWarranty = await BlockWarranty.deploy(relayer.address, hre.ethers.ZeroAddress);

  await blockWarranty.waitForDeployment();

  const contractAddress = await blockWarranty.getAddress();

  console.log("\n========================================");
  console.log("       DEPLOYMENT SUCCESSFUL");
  console.log("========================================");
  console.log("Contract Name: BlockWarranty");
  console.log("Contract Address:", contractAddress);
  console.log("Network:", hre.network.name);
  console.log("Deployer:", deployer.address);
  console.log("========================================");
}

main().catch((error) => {
  console.error("\nDeployment failed:");
  console.error(error);
  process.exitCode = 1;
});
