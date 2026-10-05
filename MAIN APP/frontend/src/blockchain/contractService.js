import { BrowserProvider, Contract, JsonRpcProvider, keccak256, toUtf8Bytes } from "ethers";
import { CONTRACT_ADDRESS, CHAIN_ID, CHAIN_HEX, CHAIN_NAME, SEPOLIA_RPC_URL, DEPLOYMENT_BLOCK } from "./contractConfig";
import BlockWarrantyABI from "../abi/BlockWarranty.json";

let readOnlyProviderInstance = null;

export function getReadOnlyProvider() {
  if (!readOnlyProviderInstance) {
    readOnlyProviderInstance = new JsonRpcProvider(SEPOLIA_RPC_URL, CHAIN_ID);
  }
  return readOnlyProviderInstance;
}

export function getContract(signerOrProvider) {
  const providerOrSigner = signerOrProvider || getReadOnlyProvider();
  return new Contract(CONTRACT_ADDRESS, BlockWarrantyABI.abi, providerOrSigner);
}

export function getReadOnlyContract() {
  return getContract(getReadOnlyProvider());
}

export function hashString(value) {
  if (!value) return "0x0000000000000000000000000000000000000000000000000000000000000000";
  return keccak256(toUtf8Bytes(String(value)));
}

export function productKey(productId) {
  return hashString(productId);
}

export function serialHash(serialNumber) {
  return hashString(serialNumber);
}

export function metadataHash(metadata) {
  if (!metadata) return "0x0000000000000000000000000000000000000000000000000000000000000000";
  const json = typeof metadata === "string" ? metadata : JSON.stringify(metadata);
  return hashString(json);
}

export function toUnixSeconds(date) {
  if (!date) return 0;
  const ms = typeof date === "number" ? date : new Date(date).getTime();
  if (Number.isNaN(ms) || ms <= 0) return 0;
  return Math.floor(ms / 1000);
}

export async function ensureSepoliaNetwork(provider) {
  if (!window.ethereum) throw new Error("MetaMask is not installed.");
  const p = provider || new BrowserProvider(window.ethereum);
  const network = await p.getNetwork();
  if (Number(network.chainId) !== CHAIN_ID) {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CHAIN_HEX }],
      });
    } catch (switchError) {
      if (switchError.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: CHAIN_HEX,
              chainName: CHAIN_NAME,
              nativeCurrency: { name: "Sepolia Ether", symbol: "SEP", decimals: 18 },
              rpcUrls: [SEPOLIA_RPC_URL],
              blockExplorerUrls: ["https://sepolia.etherscan.io"],
            },
          ],
        });
      } else {
        throw new Error("Please switch your MetaMask network to Sepolia.");
      }
    }
  }
}

/**
 * Calls BCCC registerProduct directly on-chain
 */
export async function registerProductOnChain(signer, {
  productKey: pKey,
  serialNumberHash: sHash,
  purchaseDate,
  warrantyStart,
  warrantyExpiry,
  metadataHash: mHash,
}) {
  const contract = getContract(signer);
  const pDateSec = toUnixSeconds(purchaseDate);
  const wStartSec = toUnixSeconds(warrantyStart || purchaseDate);
  const wExpirySec = toUnixSeconds(warrantyExpiry);

  const tx = await contract.registerProduct(
    pKey,
    sHash,
    pDateSec,
    wStartSec,
    wExpirySec,
    mHash
  );
  const receipt = await tx.wait(1);
  return { tx, receipt, txHash: receipt.hash };
}

/**
 * Transfers product ownership on-chain
 */
export async function transferProductOwnershipOnChain(signer, pKey, newOwner) {
  const contract = getContract(signer);
  const tx = await contract.transferOwnership(pKey, newOwner);
  const receipt = await tx.wait(1);
  return { tx, receipt, txHash: receipt.hash };
}

/**
 * Updates product warranty dates on-chain
 */
export async function updateProductWarrantyOnChain(signer, pKey, warrantyStart, warrantyExpiry) {
  const contract = getContract(signer);
  const wStartSec = toUnixSeconds(warrantyStart);
  const wExpirySec = toUnixSeconds(warrantyExpiry);
  const tx = await contract.updateWarranty(pKey, wStartSec, wExpirySec);
  const receipt = await tx.wait(1);
  return { tx, receipt, txHash: receipt.hash };
}

/**
 * Records service/repair on-chain
 */
export async function recordServiceOnChain(signer, pKey, descriptionHash) {
  const contract = getContract(signer);
  const tx = await contract.recordService(pKey, descriptionHash);
  const receipt = await tx.wait(1);
  return { tx, receipt, txHash: receipt.hash };
}

/**
 * Records warranty claim on-chain
 */
export async function recordWarrantyClaimOnChain(signer, pKey, descriptionHash, approved) {
  const contract = getContract(signer);
  const tx = await contract.recordWarrantyClaim(pKey, descriptionHash, Boolean(approved));
  const receipt = await tx.wait(1);
  return { tx, receipt, txHash: receipt.hash };
}

/**
 * Fetches authoritative Product struct from BCCC contract
 */
export async function getProductFromChain(pKey, signerOrProvider) {
  const contract = getContract(signerOrProvider);
  try {
    const exists = await contract.productExists(pKey);
    if (!exists) return null;
    const raw = await contract.getProduct(pKey);
    const active = await contract.isWarrantyActive(pKey).catch(() => false);

    const statusMap = ["None", "Active", "Claimed"];
    const statusIdx = Number(raw.status);

    return {
      productKey: raw.productKey,
      serialNumberHash: raw.serialNumberHash,
      currentOwner: raw.currentOwner,
      registeredAt: Number(raw.registeredAt) ? new Date(Number(raw.registeredAt) * 1000).toISOString() : null,
      purchaseDate: Number(raw.purchaseDate) ? new Date(Number(raw.purchaseDate) * 1000).toISOString() : null,
      warrantyStart: Number(raw.warrantyStart) ? new Date(Number(raw.warrantyStart) * 1000).toISOString() : null,
      warrantyExpiry: Number(raw.warrantyExpiry) ? new Date(Number(raw.warrantyExpiry) * 1000).toISOString() : null,
      status: statusMap[statusIdx] || "Active",
      metadataHash: raw.metadataHash,
      isWarrantyActive: active,
      raw,
    };
  } catch (err) {
    console.error("Error reading product from chain:", err);
    return null;
  }
}

/**
 * Fetches service history from BCCC contract
 */
export async function getServicesFromChain(pKey, signerOrProvider) {
  const contract = getContract(signerOrProvider);
  try {
    const count = Number(await contract.getServiceCount(pKey));
    const items = [];
    for (let i = 0; i < count; i++) {
      const record = await contract.getService(pKey, i);
      items.push({
        serviceId: Number(record.serviceId),
        timestamp: Number(record.timestamp) ? new Date(Number(record.timestamp) * 1000).toISOString() : null,
        serviceProvider: record.serviceProvider,
        descriptionHash: record.descriptionHash,
      });
    }
    return items;
  } catch (err) {
    console.warn("Could not fetch service records from contract:", err);
    return [];
  }
}

/**
 * Fetches claims from BCCC contract
 */
export async function getClaimsFromChain(pKey, signerOrProvider) {
  const contract = getContract(signerOrProvider);
  try {
    const count = Number(await contract.getClaimCount(pKey));
    const items = [];
    for (let i = 0; i < count; i++) {
      const claim = await contract.getWarrantyClaim(pKey, i);
      items.push({
        claimId: Number(claim.claimId),
        timestamp: Number(claim.timestamp) ? new Date(Number(claim.timestamp) * 1000).toISOString() : null,
        claimant: claim.claimant,
        descriptionHash: claim.descriptionHash,
        approved: Boolean(claim.approved),
      });
    }
    return items;
  } catch (err) {
    console.warn("Could not fetch claims from contract:", err);
    return [];
  }
}

/**
 * Queries on-chain events to discover all productKeys owned by a wallet
 */
export async function getOwnedProductKeysFromChain(walletAddress, signerOrProvider) {
  if (!walletAddress) return [];
  const contract = getContract(signerOrProvider);
  const targetWallet = walletAddress.toLowerCase();

  try {
    // 1. Query ProductRegistered events
    const registeredFilter = contract.filters.ProductRegistered(null, walletAddress);
    // 2. Query OwnershipTransferred events where user is newOwner
    const transferredFilter = contract.filters.OwnershipTransferred(null, null, walletAddress);

    const fromBlock = DEPLOYMENT_BLOCK;
    const [registeredEvents, transferredEvents] = await Promise.all([
      contract.queryFilter(registeredFilter, fromBlock, "latest").catch((e) => {
        console.warn("registeredFilter failed:", e);
        return [];
      }),
      contract.queryFilter(transferredFilter, fromBlock, "latest").catch((e) => {
        console.warn("transferredFilter failed:", e);
        return [];
      }),
    ]);

    const candidateKeys = new Set();
    for (const ev of registeredEvents) {
      if (ev.args?.productKey) candidateKeys.add(ev.args.productKey);
    }
    for (const ev of transferredEvents) {
      if (ev.args?.productKey) candidateKeys.add(ev.args.productKey);
    }

    // Confirm current owner from contract for each candidate
    const ownedKeys = [];
    for (const pKey of candidateKeys) {
      try {
        const prod = await contract.getProduct(pKey);
        if (prod.currentOwner && prod.currentOwner.toLowerCase() === targetWallet) {
          ownedKeys.push(pKey);
        }
      } catch (err) {
        // Product might not exist or reverted
      }
    }

    return ownedKeys;
  } catch (err) {
    console.error("Error querying owned product keys:", err);
    return [];
  }
}

/**
 * Queries all lifecycle events for a specific productKey to build authoritative timeline
 */
export async function getProductLifecycleEvents(pKey, signerOrProvider) {
  const contract = getContract(signerOrProvider);
  const fromBlock = DEPLOYMENT_BLOCK;

  try {
    const [regLogs, xferLogs, warrLogs, srvLogs, clmLogs] = await Promise.all([
      contract.queryFilter(contract.filters.ProductRegistered(pKey), fromBlock, "latest").catch(() => []),
      contract.queryFilter(contract.filters.OwnershipTransferred(pKey), fromBlock, "latest").catch(() => []),
      contract.queryFilter(contract.filters.WarrantyUpdated(pKey), fromBlock, "latest").catch(() => []),
      contract.queryFilter(contract.filters.ServiceRecorded(pKey), fromBlock, "latest").catch(() => []),
      contract.queryFilter(contract.filters.WarrantyClaimRecorded(pKey), fromBlock, "latest").catch(() => []),
    ]);

    const events = [];

    for (const ev of regLogs) {
      const block = await ev.getBlock().catch(() => null);
      events.push({
        type: "ProductRegistered",
        title: "Product registered on blockchain",
        txHash: ev.transactionHash,
        blockNumber: ev.blockNumber,
        timestamp: block?.timestamp ? new Date(block.timestamp * 1000).toISOString() : null,
        owner: ev.args?.owner,
        purchaseDate: ev.args?.purchaseDate ? new Date(Number(ev.args.purchaseDate) * 1000).toISOString() : null,
        warrantyStart: ev.args?.warrantyStart ? new Date(Number(ev.args.warrantyStart) * 1000).toISOString() : null,
        warrantyExpiry: ev.args?.warrantyExpiry ? new Date(Number(ev.args.warrantyExpiry) * 1000).toISOString() : null,
      });
    }

    for (const ev of xferLogs) {
      const block = await ev.getBlock().catch(() => null);
      events.push({
        type: "OwnershipTransferred",
        title: "Ownership transferred",
        txHash: ev.transactionHash,
        blockNumber: ev.blockNumber,
        timestamp: block?.timestamp ? new Date(block.timestamp * 1000).toISOString() : null,
        previousOwner: ev.args?.previousOwner,
        newOwner: ev.args?.newOwner,
      });
    }

    for (const ev of warrLogs) {
      const block = await ev.getBlock().catch(() => null);
      events.push({
        type: "WarrantyUpdated",
        title: "Warranty dates updated",
        txHash: ev.transactionHash,
        blockNumber: ev.blockNumber,
        timestamp: block?.timestamp ? new Date(block.timestamp * 1000).toISOString() : null,
        warrantyStart: ev.args?.warrantyStart ? new Date(Number(ev.args.warrantyStart) * 1000).toISOString() : null,
        warrantyExpiry: ev.args?.warrantyExpiry ? new Date(Number(ev.args.warrantyExpiry) * 1000).toISOString() : null,
      });
    }

    for (const ev of srvLogs) {
      events.push({
        type: "ServiceRecorded",
        title: "Service / repair recorded",
        txHash: ev.transactionHash,
        blockNumber: ev.blockNumber,
        timestamp: ev.args?.timestamp ? new Date(Number(ev.args.timestamp) * 1000).toISOString() : null,
        serviceId: Number(ev.args?.serviceId),
        serviceProvider: ev.args?.serviceProvider,
        descriptionHash: ev.args?.descriptionHash,
      });
    }

    for (const ev of clmLogs) {
      events.push({
        type: "WarrantyClaimRecorded",
        title: `Warranty claim ${ev.args?.approved ? "approved" : "recorded"}`,
        txHash: ev.transactionHash,
        blockNumber: ev.blockNumber,
        timestamp: ev.args?.timestamp ? new Date(Number(ev.args.timestamp) * 1000).toISOString() : null,
        claimId: Number(ev.args?.claimId),
        claimant: ev.args?.claimant,
        descriptionHash: ev.args?.descriptionHash,
        approved: Boolean(ev.args?.approved),
      });
    }

    // Sort chronologically
    events.sort((a, b) => {
      const timeA = new Date(a.timestamp || 0).getTime();
      const timeB = new Date(b.timestamp || 0).getTime();
      return timeA - timeB;
    });

    return events;
  } catch (err) {
    console.error("Error loading lifecycle events:", err);
    return [];
  }
}
