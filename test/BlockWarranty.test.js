const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BlockWarranty", function () {
  let BlockWarranty;
  let contract;

  let owner;
  let newOwner;
  let attacker;
  let serviceProvider;

  let purchaseDate;
  let warrantyStart;
  let warrantyExpiry;

  const productKey = ethers.keccak256(
    ethers.toUtf8Bytes("PRODUCT-001")
  );

  const serialHash = ethers.keccak256(
    ethers.toUtf8Bytes("SERIAL-001")
  );

  const metadataHash = ethers.keccak256(
    ethers.toUtf8Bytes("METADATA-001")
  );

  const serviceHash = ethers.keccak256(
    ethers.toUtf8Bytes("SERVICE-001")
  );

  const serviceHash2 = ethers.keccak256(
    ethers.toUtf8Bytes("SERVICE-002")
  );

  const claimHash = ethers.keccak256(
    ethers.toUtf8Bytes("CLAIM-001")
  );

  const claimHash2 = ethers.keccak256(
    ethers.toUtf8Bytes("CLAIM-002")
  );

  // ------------------------------------------------------------
  // Helper: register a product
  // ------------------------------------------------------------

  async function registerProduct(
    contractInstance = contract,
    key = productKey,
    serial = serialHash,
    purchase = purchaseDate,
    start = warrantyStart,
    expiry = warrantyExpiry,
    metadata = metadataHash
  ) {
    return contractInstance.registerProduct(
      key,
      serial,
      purchase,
      start,
      expiry,
      metadata
    );
  }

  // ------------------------------------------------------------
  // Fresh deployment before every test
  // ------------------------------------------------------------

  beforeEach(async function () {
    [owner, newOwner, attacker, serviceProvider] =
      await ethers.getSigners();

    const latestBlock =
      await ethers.provider.getBlock("latest");

    /*
     * Use timestamps relative to the current Hardhat blockchain.
     * This prevents tests from becoming invalid as real-world
     * time advances.
     */

    purchaseDate = latestBlock.timestamp;
    warrantyStart = latestBlock.timestamp;
    warrantyExpiry =
      latestBlock.timestamp + 30 * 24 * 60 * 60;

    BlockWarranty =
      await ethers.getContractFactory("BlockWarranty");

    contract = await BlockWarranty.deploy();

    await contract.waitForDeployment();
  });

  // ============================================================
  // DEPLOYMENT
  // ============================================================

  describe("Deployment", function () {
    it("should deploy successfully", async function () {
      const address = await contract.getAddress();

      expect(address).to.properAddress;
    });
  });

  // ============================================================
  // PRODUCT REGISTRATION
  // ============================================================

  describe("Product Registration", function () {
    it("should register a product successfully", async function () {
      await registerProduct();

      expect(
        await contract.productExists(productKey)
      ).to.equal(true);
    });

    it("should emit ProductRegistered event", async function () {
      await expect(registerProduct())
        .to.emit(contract, "ProductRegistered")
        .withArgs(
          productKey,
          owner.address,
          serialHash,
          purchaseDate,
          warrantyStart,
          warrantyExpiry,
          metadataHash
        );
    });

    it("should store all product fields correctly", async function () {
      await registerProduct();

      const product =
        await contract.getProduct(productKey);

      expect(product.productKey).to.equal(productKey);
      expect(product.serialNumberHash).to.equal(
        serialHash
      );
      expect(product.currentOwner).to.equal(
        owner.address
      );
      expect(product.purchaseDate).to.equal(
        purchaseDate
      );
      expect(product.warrantyStart).to.equal(
        warrantyStart
      );
      expect(product.warrantyExpiry).to.equal(
        warrantyExpiry
      );

      // ProductStatus.Active = 1
      expect(product.status).to.equal(1);

      expect(product.metadataHash).to.equal(
        metadataHash
      );

      expect(product.registeredAt).to.be.greaterThan(0);
    });

    it("should reject duplicate product registration", async function () {
      await registerProduct();

      await expect(
        registerProduct()
      ).to.be.revertedWith(
        "Product already registered"
      );
    });

    it("should reject zero product key", async function () {
      await expect(
        registerProduct(
          contract,
          ethers.ZeroHash
        )
      ).to.be.revertedWith(
        "Invalid product key"
      );
    });

    it("should reject zero serial hash", async function () {
      await expect(
        registerProduct(
          contract,
          productKey,
          ethers.ZeroHash
        )
      ).to.be.revertedWith(
        "Invalid serial hash"
      );
    });

    it("should reject warranty expiry before warranty start", async function () {
      await expect(
        registerProduct(
          contract,
          productKey,
          serialHash,
          purchaseDate,
          warrantyStart,
          warrantyStart - 1
        )
      ).to.be.revertedWith(
        "Invalid warranty dates"
      );
    });

    it("should reject warranty start before purchase date", async function () {
      await expect(
        registerProduct(
          contract,
          productKey,
          serialHash,
          purchaseDate,
          purchaseDate - 1,
          warrantyExpiry
        )
      ).to.be.revertedWith(
        "Warranty cannot start before purchase"
      );
    });

    it("should allow multiple different products", async function () {
      const product2 =
        ethers.keccak256(
          ethers.toUtf8Bytes("PRODUCT-002")
        );

      const serial2 =
        ethers.keccak256(
          ethers.toUtf8Bytes("SERIAL-002")
        );

      const metadata2 =
        ethers.keccak256(
          ethers.toUtf8Bytes("METADATA-002")
        );

      await registerProduct();

      await registerProduct(
        contract,
        product2,
        serial2,
        purchaseDate,
        warrantyStart,
        warrantyExpiry,
        metadata2
      );

      expect(
        await contract.productExists(productKey)
      ).to.equal(true);

      expect(
        await contract.productExists(product2)
      ).to.equal(true);
    });
  });

  // ============================================================
  // PRODUCT READS
  // ============================================================

  describe("Product Reads", function () {
    it("should return false for an unknown product", async function () {
      const unknownKey =
        ethers.keccak256(
          ethers.toUtf8Bytes("UNKNOWN")
        );

      expect(
        await contract.productExists(
          unknownKey
        )
      ).to.equal(false);
    });

    it("should revert when reading an unknown product", async function () {
      const unknownKey =
        ethers.keccak256(
          ethers.toUtf8Bytes("UNKNOWN")
        );

      await expect(
        contract.getProduct(unknownKey)
      ).to.be.revertedWith(
        "Product does not exist"
      );
    });
  });

  // ============================================================
  // OWNERSHIP
  // ============================================================

  describe("Ownership", function () {
    beforeEach(async function () {
      await registerProduct();
    });

    it("should transfer ownership successfully", async function () {
      await contract.transferOwnership(
        productKey,
        newOwner.address
      );

      const product =
        await contract.getProduct(productKey);

      expect(product.currentOwner).to.equal(
        newOwner.address
      );
    });

    it("should emit OwnershipTransferred event", async function () {
      await expect(
        contract.transferOwnership(
          productKey,
          newOwner.address
        )
      )
        .to.emit(
          contract,
          "OwnershipTransferred"
        )
        .withArgs(
          productKey,
          owner.address,
          newOwner.address
        );
    });

    it("should not change product lifecycle status", async function () {
      const before =
        await contract.getProduct(productKey);

      await contract.transferOwnership(
        productKey,
        newOwner.address
      );

      const after =
        await contract.getProduct(productKey);

      expect(after.status).to.equal(
        before.status
      );
    });

    it("should reject transfer by non-owner", async function () {
      await expect(
        contract
          .connect(attacker)
          .transferOwnership(
            productKey,
            newOwner.address
          )
      ).to.be.revertedWith(
        "Not product owner"
      );
    });

    it("should reject zero address", async function () {
      await expect(
        contract.transferOwnership(
          productKey,
          ethers.ZeroAddress
        )
      ).to.be.revertedWith(
        "Invalid new owner"
      );
    });

    it("should reject transfer to current owner", async function () {
      await expect(
        contract.transferOwnership(
          productKey,
          owner.address
        )
      ).to.be.revertedWith(
        "Already the owner"
      );
    });

    it("should remove permissions from old owner", async function () {
      await contract.transferOwnership(
        productKey,
        newOwner.address
      );

      await expect(
        contract.updateWarranty(
          productKey,
          warrantyStart,
          warrantyExpiry
        )
      ).to.be.revertedWith(
        "Not product owner"
      );
    });

    it("should give permissions to new owner", async function () {
      await contract.transferOwnership(
        productKey,
        newOwner.address
      );

      await expect(
        contract
          .connect(newOwner)
          .updateWarranty(
            productKey,
            warrantyStart,
            warrantyExpiry
          )
      ).to.not.be.reverted;
    });
  });

  // ============================================================
  // WARRANTY
  // ============================================================

  describe("Warranty", function () {
    it("should report warranty active during warranty period", async function () {
      await registerProduct();

      expect(
        await contract.isWarrantyActive(
          productKey
        )
      ).to.equal(true);
    });

    it("should report warranty inactive before warranty start", async function () {
      const latestBlock =
        await ethers.provider.getBlock(
          "latest"
        );

      const start =
        latestBlock.timestamp + 3600;

      const expiry =
        start + 30 * 24 * 60 * 60;

      await registerProduct(
        contract,
        productKey,
        serialHash,
        latestBlock.timestamp,
        start,
        expiry,
        metadataHash
      );

      expect(
        await contract.isWarrantyActive(
          productKey
        )
      ).to.equal(false);
    });

    it("should report warranty inactive after expiry", async function () {
      await registerProduct();

      const expiryBlockTimestamp =
        warrantyExpiry + 1;

      await ethers.provider.send(
        "evm_setNextBlockTimestamp",
        [expiryBlockTimestamp]
      );

      await ethers.provider.send(
        "evm_mine"
      );

      expect(
        await contract.isWarrantyActive(
          productKey
        )
      ).to.equal(false);
    });

    it("should update warranty successfully", async function () {
      await registerProduct();

      const newStart =
        warrantyStart + 1000;

      const newExpiry =
        warrantyExpiry + 1000;

      await contract.updateWarranty(
        productKey,
        newStart,
        newExpiry
      );

      const product =
        await contract.getProduct(productKey);

      expect(product.warrantyStart).to.equal(
        newStart
      );

      expect(product.warrantyExpiry).to.equal(
        newExpiry
      );
    });

    it("should emit WarrantyUpdated event", async function () {
      await registerProduct();

      const newStart =
        warrantyStart + 1000;

      const newExpiry =
        warrantyExpiry + 1000;

      await expect(
        contract.updateWarranty(
          productKey,
          newStart,
          newExpiry
        )
      )
        .to.emit(
          contract,
          "WarrantyUpdated"
        )
        .withArgs(
          productKey,
          newStart,
          newExpiry
        );
    });

    it("should reject invalid warranty dates", async function () {
      await registerProduct();

      await expect(
        contract.updateWarranty(
          productKey,
          warrantyExpiry,
          warrantyStart
        )
      ).to.be.revertedWith(
        "Invalid warranty dates"
      );
    });

    it("should reject warranty update by non-owner", async function () {
      await registerProduct();

      await expect(
        contract
          .connect(attacker)
          .updateWarranty(
            productKey,
            warrantyStart,
            warrantyExpiry
          )
      ).to.be.revertedWith(
        "Not product owner"
      );
    });
  });

  // ============================================================
  // SERVICE RECORDS
  // ============================================================

  describe("Service Records", function () {
    beforeEach(async function () {
      await registerProduct();
    });

    it("should initially have zero service records", async function () {
      expect(
        await contract.getServiceCount(
          productKey
        )
      ).to.equal(0);
    });

    it("should record a service successfully", async function () {
      await contract.recordService(
        productKey,
        serviceHash
      );

      expect(
        await contract.getServiceCount(
          productKey
        )
      ).to.equal(1);
    });

    it("should emit ServiceRecorded event", async function () {
      await expect(
        contract.recordService(
          productKey,
          serviceHash
        )
      ).to.emit(
        contract,
        "ServiceRecorded"
      );
    });

    it("should store service data correctly", async function () {
      await contract.recordService(
        productKey,
        serviceHash
      );

      const service =
        await contract.getService(
          productKey,
          0
        );

      expect(service.serviceId).to.equal(0);

      expect(
        service.serviceProvider
      ).to.equal(owner.address);

      expect(
        service.descriptionHash
      ).to.equal(serviceHash);

      expect(
        service.timestamp
      ).to.be.greaterThan(0);
    });

    it("should create sequential service IDs", async function () {
      await contract.recordService(
        productKey,
        serviceHash
      );

      await contract.recordService(
        productKey,
        serviceHash2
      );

      const first =
        await contract.getService(
          productKey,
          0
        );

      const second =
        await contract.getService(
          productKey,
          1
        );

      expect(first.serviceId).to.equal(0);
      expect(second.serviceId).to.equal(1);
    });

    it("should reject zero description hash", async function () {
      await expect(
        contract.recordService(
          productKey,
          ethers.ZeroHash
        )
      ).to.be.revertedWith(
        "Invalid description hash"
      );
    });

    it("should reject service recording by non-owner", async function () {
      await expect(
        contract
          .connect(attacker)
          .recordService(
            productKey,
            serviceHash
          )
      ).to.be.revertedWith(
        "Not product owner"
      );
    });

    it("should reject invalid service ID", async function () {
      await expect(
        contract.getService(
          productKey,
          0
        )
      ).to.be.revertedWith(
        "Service record not found"
      );
    });
  });

  // ============================================================
  // WARRANTY CLAIMS
  // ============================================================

  describe("Warranty Claims", function () {
    beforeEach(async function () {
      await registerProduct();
    });

    it("should initially have zero claims", async function () {
      expect(
        await contract.getClaimCount(
          productKey
        )
      ).to.equal(0);
    });

    it("should record an approved claim", async function () {
      await contract.recordWarrantyClaim(
        productKey,
        claimHash,
        true
      );

      expect(
        await contract.getClaimCount(
          productKey
        )
      ).to.equal(1);
    });

    it("should emit WarrantyClaimRecorded event", async function () {
      await expect(
        contract.recordWarrantyClaim(
          productKey,
          claimHash,
          true
        )
      ).to.emit(
        contract,
        "WarrantyClaimRecorded"
      );
    });

    it("should store claim data correctly", async function () {
      await contract.recordWarrantyClaim(
        productKey,
        claimHash,
        true
      );

      const claim =
        await contract.getWarrantyClaim(
          productKey,
          0
        );

      expect(claim.claimId).to.equal(0);

      expect(claim.claimant).to.equal(
        owner.address
      );

      expect(
        claim.descriptionHash
      ).to.equal(claimHash);

      expect(claim.approved).to.equal(true);

      expect(
        claim.timestamp
      ).to.be.greaterThan(0);
    });

    it("should change status to Claimed when approved", async function () {
      await contract.recordWarrantyClaim(
        productKey,
        claimHash,
        true
      );

      const product =
        await contract.getProduct(
          productKey
        );

      // ProductStatus.Claimed = 2
      expect(product.status).to.equal(2);
    });

    it("should keep status Active when rejected", async function () {
      await contract.recordWarrantyClaim(
        productKey,
        claimHash,
        false
      );

      const product =
        await contract.getProduct(
          productKey
        );

      // ProductStatus.Active = 1
      expect(product.status).to.equal(1);
    });

    it("should support multiple claims", async function () {
      await contract.recordWarrantyClaim(
        productKey,
        claimHash,
        false
      );

      await contract.recordWarrantyClaim(
        productKey,
        claimHash2,
        true
      );

      expect(
        await contract.getClaimCount(
          productKey
        )
      ).to.equal(2);

      const second =
        await contract.getWarrantyClaim(
          productKey,
          1
        );

      expect(second.claimId).to.equal(1);

      expect(
        second.descriptionHash
      ).to.equal(claimHash2);
    });

    it("should reject zero claim description hash", async function () {
      await expect(
        contract.recordWarrantyClaim(
          productKey,
          ethers.ZeroHash,
          true
        )
      ).to.be.revertedWith(
        "Invalid description hash"
      );
    });

    it("should reject claims by non-owner", async function () {
      await expect(
        contract
          .connect(attacker)
          .recordWarrantyClaim(
            productKey,
            claimHash,
            true
          )
      ).to.be.revertedWith(
        "Not product owner"
      );
    });

    it("should reject invalid claim ID", async function () {
      await expect(
        contract.getWarrantyClaim(
          productKey,
          0
        )
      ).to.be.revertedWith(
        "Warranty claim not found"
      );
    });
  });

  // ============================================================
  // MULTIPLE PRODUCT ISOLATION
  // ============================================================

  describe("Multiple Product Isolation", function () {
    it("should isolate service records between products", async function () {
      const product2 =
        ethers.keccak256(
          ethers.toUtf8Bytes("PRODUCT-002")
        );

      const serial2 =
        ethers.keccak256(
          ethers.toUtf8Bytes("SERIAL-002")
        );

      const metadata2 =
        ethers.keccak256(
          ethers.toUtf8Bytes("META-002")
        );

      await registerProduct();

      await registerProduct(
        contract,
        product2,
        serial2,
        purchaseDate,
        warrantyStart,
        warrantyExpiry,
        metadata2
      );

      await contract.recordService(
        productKey,
        serviceHash
      );

      expect(
        await contract.getServiceCount(
          productKey
        )
      ).to.equal(1);

      expect(
        await contract.getServiceCount(
          product2
        )
      ).to.equal(0);
    });

    it("should isolate warranty claims between products", async function () {
      const product2 =
        ethers.keccak256(
          ethers.toUtf8Bytes("PRODUCT-002")
        );

      const serial2 =
        ethers.keccak256(
          ethers.toUtf8Bytes("SERIAL-002")
        );

      const metadata2 =
        ethers.keccak256(
          ethers.toUtf8Bytes("META-002")
        );

      await registerProduct();

      await registerProduct(
        contract,
        product2,
        serial2,
        purchaseDate,
        warrantyStart,
        warrantyExpiry,
        metadata2
      );

      await contract.recordWarrantyClaim(
        productKey,
        claimHash,
        true
      );

      expect(
        await contract.getClaimCount(
          productKey
        )
      ).to.equal(1);

      expect(
        await contract.getClaimCount(
          product2
        )
      ).to.equal(0);

      const product2Data =
        await contract.getProduct(
          product2
        );

      expect(product2Data.status).to.equal(1);
    });
  });

  // ============================================================
  // AUTHORIZATION
  // ============================================================

  describe("Authorization", function () {
    beforeEach(async function () {
      await registerProduct();
    });

    it("should reject attacker from transferring ownership", async function () {
      await expect(
        contract
          .connect(attacker)
          .transferOwnership(
            productKey,
            attacker.address
          )
      ).to.be.revertedWith(
        "Not product owner"
      );
    });

    it("should reject attacker from updating warranty", async function () {
      await expect(
        contract
          .connect(attacker)
          .updateWarranty(
            productKey,
            warrantyStart,
            warrantyExpiry
          )
      ).to.be.revertedWith(
        "Not product owner"
      );
    });

    it("should reject attacker from recording service", async function () {
      await expect(
        contract
          .connect(attacker)
          .recordService(
            productKey,
            serviceHash
          )
      ).to.be.revertedWith(
        "Not product owner"
      );
    });

    it("should reject attacker from recording warranty claim", async function () {
      await expect(
        contract
          .connect(attacker)
          .recordWarrantyClaim(
            productKey,
            claimHash,
            true
          )
      ).to.be.revertedWith(
        "Not product owner"
      );
    });
  });
});