const { ethers } = require('ethers');

/**
 * Compute the canonical 32-byte cryptographic leaf hash for a physical unit.
 * Uses packed ABI encoding to guarantee deterministic representation.
 */
function computeUnitLeaf({ productId, warrantyId, manufacturerSerialNumber, warrantyDurationMonths }) {
  const encoded = ethers.solidityPacked(
    ['string', 'string', 'string', 'uint256'],
    [
      String(productId || '').trim(),
      String(warrantyId || '').trim(),
      String(manufacturerSerialNumber || '').trim(),
      Number(warrantyDurationMonths || 12)
    ]
  );
  return ethers.keccak256(encoded);
}

/**
 * Pairwise sorted hash complying with the OpenZeppelin MerkleProof standard.
 */
function hashPair(a, b) {
  const aNorm = a.startsWith('0x') ? a : `0x${a}`;
  const bNorm = b.startsWith('0x') ? b : `0x${b}`;

  if (BigInt(aNorm) < BigInt(bNorm)) {
    return ethers.keccak256(ethers.concat([aNorm, bNorm]));
  }
  return ethers.keccak256(ethers.concat([bNorm, aNorm]));
}

/**
 * High-performance cryptographic Merkle Tree generator for inventory batches.
 */
class MerkleTree {
  constructor(leaves) {
    if (!leaves || leaves.length === 0) {
      throw new Error('Merkle tree requires at least one leaf node.');
    }
    this.leaves = leaves.map((l) => (l.startsWith('0x') ? l : `0x${l}`));
    this.layers = [this.leaves];
    this._buildTree();
  }

  _buildTree() {
    let current = this.layers[0];
    while (current.length > 1) {
      const next = [];
      for (let i = 0; i < current.length; i += 2) {
        if (i + 1 < current.length) {
          next.push(hashPair(current[i], current[i + 1]));
        } else {
          // Odd leaf: promote node to the next level
          next.push(current[i]);
        }
      }
      this.layers.push(next);
      current = next;
    }
  }

  getRoot() {
    return this.layers[this.layers.length - 1][0];
  }

  getProof(index) {
    if (index < 0 || index >= this.leaves.length) {
      throw new Error(`Leaf index ${index} out of bounds.`);
    }
    const proof = [];
    let currentIndex = index;

    for (let layerIndex = 0; layerIndex < this.layers.length - 1; layerIndex++) {
      const layer = this.layers[layerIndex];
      const isRight = currentIndex % 2 === 1;
      const pairIndex = isRight ? currentIndex - 1 : currentIndex + 1;

      if (pairIndex < layer.length) {
        proof.push(layer[pairIndex]);
      }
      currentIndex = Math.floor(currentIndex / 2);
    }

    return proof;
  }

  static verify(leaf, proof, root) {
    let computed = leaf.startsWith('0x') ? leaf : `0x${leaf}`;
    const rootNorm = root.startsWith('0x') ? root : `0x${root}`;

    for (const sibling of proof) {
      const sibNorm = sibling.startsWith('0x') ? sibling : `0x${sibling}`;
      computed = hashPair(computed, sibNorm);
    }
    return computed.toLowerCase() === rootNorm.toLowerCase();
  }
}

module.exports = {
  MerkleTree,
  computeUnitLeaf,
  hashPair
};
