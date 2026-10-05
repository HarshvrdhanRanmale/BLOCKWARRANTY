const ganache = require('ganache');
const { ethers } = require('ethers');
const { artifact, productKey, hashDocument, hashDetails } = require('../src/services/blockchain');

describe('BlockWarranty lifecycle contract', () => {
  let raw; let provider; let owner; let recipient; let contract;
  beforeAll(async () => {
    raw = ganache.provider({ logging: { quiet: true }, chain: { chainId: 31337 } });
    provider = new ethers.BrowserProvider(raw); owner = await provider.getSigner(0); recipient = await provider.getSigner(1);
    contract = await new ethers.ContractFactory(artifact.abi, `0x${artifact.evm.bytecode.object}`, owner).deploy();
    await contract.waitForDeployment();
  });
  afterAll(async () => { await raw.disconnect(); });
  test('registers products, verifies warranty, and transfers ownership with events', async () => {
    const key = productKey('BW-TEST-0001');
    const now = Math.floor(Date.now() / 1000);
    await (await contract.registerProduct(key, now, now + 31536000)).wait();
    const state = await contract.getProduct(key);
    expect(state.currentOwner.toLowerCase()).toBe((await owner.getAddress()).toLowerCase());
    expect(Number(state.warrantyExpiry)).toBe(now + 31536000);
    await expect(contract.registerProduct(key, now, now + 31536000).then((tx) => tx.wait())).rejects.toThrow();
    const transfer = await (await contract.transferOwnership(key, await recipient.getAddress())).wait();
    expect(transfer.logs.some((log) => { try { return contract.interface.parseLog(log)?.name === 'OwnershipTransferred'; } catch { return false; } })).toBe(true);
    expect((await contract.getProduct(key)).currentOwner.toLowerCase()).toBe((await recipient.getAddress()).toLowerCase());
  });
  test('records service/claim hashes and never stores document contents', async () => {
    const key = productKey('BW-TEST-0002'); const now = Math.floor(Date.now() / 1000);
    await (await contract.registerProduct(key, now, now + 1)).wait();
    const serviceKey = ethers.keccak256(ethers.toUtf8Bytes('BWS-TEST'));
    const documentHash = hashDocument('a'.repeat(64)); const detailsHash = hashDetails({ issue: 'screen repair' });
    const receipt = await (await contract.recordService(key, serviceKey, documentHash, detailsHash, now)).wait();
    const event = receipt.logs.map((log) => { try { return contract.interface.parseLog(log); } catch { return null; } }).find((log) => log?.name === 'ServiceRecorded');
    expect(event.args.documentHash).toBe(documentHash);
    expect(event.args.detailsHash).toBe(detailsHash);
    expect(artifact.abi.some((entry) => entry.type === 'function' && /invoice|documentData|image/i.test(entry.name))).toBe(false);
  });
});
