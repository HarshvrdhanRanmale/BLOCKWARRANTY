// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILegacyBlockWarranty {
    struct Product {
        bytes32 productKey;
        bytes32 serialNumberHash;
        address currentOwner;
        uint64 registeredAt;
        uint64 purchaseDate;
        uint64 warrantyStart;
        uint64 warrantyExpiry;
        uint8 status;
        bytes32 metadataHash;
    }
    struct ServiceRecord { uint256 serviceId; uint256 timestamp; address serviceProvider; bytes32 descriptionHash; }
    struct WarrantyClaim { uint256 claimId; uint256 timestamp; address claimant; bytes32 descriptionHash; bool approved; }
    function productExists(bytes32 productKey) external view returns (bool);
    function getProduct(bytes32 productKey) external view returns (Product memory);
    function getServiceCount(bytes32 productKey) external view returns (uint256);
    function getService(bytes32 productKey, uint256 serviceId) external view returns (ServiceRecord memory);
    function getClaimCount(bytes32 productKey) external view returns (uint256);
    function getWarrantyClaim(bytes32 productKey, uint256 claimId) external view returns (WarrantyClaim memory);
}

/// @title BlockWarranty
/// @notice Decentralized product warranty and ownership management system.
///         The contract is the authoritative source of truth for product
///         registration, ownership transfers, warranty information, service
///         records, and warranty claims. All sensitive data is represented
///         on-chain as hashes (bytes32) — never as raw values.
contract BlockWarranty {
    // ============================================================
    // ENUMS
    // ============================================================

    /// @notice Lifecycle status of a product.
    ///         None   – product has not been registered (default).
    ///         Active – product is registered and warranty is in use.
    ///         Claimed – an approved warranty claim has been recorded.
    enum ProductStatus {
        None,
        Active,
        Claimed
    }

    // ============================================================
    // STRUCTS
    // ============================================================

    /// @notice Canonical product record stored per productKey.
    /// @dev   serialNumberHash and metadataHash reference off-chain data;
    ///        raw serial numbers and private documents are never stored.
    struct Product {
        bytes32 productKey;          // unique identifier
        bytes32 serialNumberHash;     // hash of the physical serial number
        address currentOwner;         // wallet that currently owns this product
        uint64 registeredAt;         // block timestamp at registration
        uint64 purchaseDate;         // declared purchase date
        uint64 warrantyStart;         // warranty period start
        uint64 warrantyExpiry;        // warranty period end
        ProductStatus status;         // lifecycle status
        bytes32 metadataHash;         // off-chain metadata / document reference
    }

    /// @notice A single service / repair record attached to a product.
    struct ServiceRecord {
        uint256 serviceId;           // sequential id (= array index)
        uint256 timestamp;           // block timestamp when recorded
        address serviceProvider;     // who performed / logged the service
        bytes32 descriptionHash;     // hash of the off-chain description
    }

    /// @notice A single warranty claim attached to a product.
    struct WarrantyClaim {
        uint256 claimId;             // sequential id (= array index)
        uint256 timestamp;           // block timestamp when recorded
        address claimant;            // who filed the claim
        bytes32 descriptionHash;     // hash of the off-chain description
        bool approved;               // whether the claim was approved
    }

    // ============================================================
    // STATE VARIABLES
    // ============================================================

    /// @dev productKey => Product
    mapping(bytes32 => Product) private products;

    /// @dev productKey => ServiceRecord[]
    mapping(bytes32 => ServiceRecord[]) private serviceRecords;

    /// @dev productKey => WarrantyClaim[]
    mapping(bytes32 => WarrantyClaim[]) private warrantyClaims;

    // ============================================================
    // RELAYER (OPERATOR) AUTHORIZATION
    // ============================================================

    /// @notice Administers the relayer role. Set once at deployment.
    address public contractOwner;

    /// @notice Backend-controlled account permitted to execute
    ///         `transferOwnershipByRelayer` after a verified off-chain payment.
    ///         This is a dedicated low-value wallet, never a user wallet. It is
    ///         authorized to move ownership only for products whose payment has
    ///         already been verified server-side.
    address public relayer;

    /// @notice Legacy deployment from which the contract owner may import
    ///         existing products, including their full on-chain histories.
    address public immutable migrationSource;
    bool public migrationOpen = true;

    // ============================================================
    // EVENTS
    // ============================================================

    event RelayerUpdated(address indexed previousRelayer, address indexed newRelayer);

    event OwnershipTransferredByRelayer(
        bytes32 indexed productKey,
        address indexed previousOwner,
        address indexed newOwner,
        address relayer
    );

    event ProductMigrated(bytes32 indexed productKey, address indexed currentOwner, address indexed source);
    event MigrationClosed();

    event ProductRegistered(
        bytes32 indexed productKey,
        address indexed owner,
        bytes32 serialNumberHash,
        uint256 purchaseDate,
        uint256 warrantyStart,
        uint256 warrantyExpiry,
        bytes32 metadataHash
    );

    event OwnershipTransferred(
        bytes32 indexed productKey,
        address indexed previousOwner,
        address indexed newOwner
    );

    event WarrantyUpdated(
        bytes32 indexed productKey,
        uint256 warrantyStart,
        uint256 warrantyExpiry
    );

    event ServiceRecorded(
        bytes32 indexed productKey,
        uint256 indexed serviceId,
        address indexed serviceProvider,
        bytes32 descriptionHash,
        uint256 timestamp
    );

    event WarrantyClaimRecorded(
        bytes32 indexed productKey,
        uint256 indexed claimId,
        address indexed claimant,
        bytes32 descriptionHash,
        bool approved,
        uint256 timestamp
    );

    // ============================================================
    // MODIFIERS
    // ============================================================

    /// @dev Reverts if no product is registered under productKey.
    modifier productMustExist(bytes32 productKey) {
        require(
            products[productKey].currentOwner != address(0),
            "Product does not exist"
        );
        _;
    }

    /// @dev Reverts unless the caller is the current owner of the product.
    modifier onlyProductOwner(bytes32 productKey) {
        require(
            products[productKey].currentOwner == msg.sender,
            "Not product owner"
        );
        _;
    }

    /// @dev Reverts unless the caller is the authorized backend relayer.
    modifier onlyRelayer() {
        require(msg.sender == relayer, "Not authorized relayer");
        _;
    }

    /// @dev Reverts unless the caller is the contract owner (relayer admin).
    modifier onlyContractOwner() {
        require(msg.sender == contractOwner, "Not contract owner");
        _;
    }

    // ============================================================
    // CONSTRUCTOR
    // ============================================================

    /// @param initialRelayer The backend wallet authorized to perform
    ///        relayer transfers after verified payments. Pass address(0) to
    ///        disable relayer transfers initially; it can be set later by the
    ///        contract owner.
    constructor(address initialRelayer, address legacyContract) {
        contractOwner = msg.sender;
        relayer = initialRelayer;
        migrationSource = legacyContract;
        emit RelayerUpdated(address(0), initialRelayer);
    }

    /// @notice Updates the authorized relayer wallet. Only the contract owner.
    function setRelayer(address newRelayer) external onlyContractOwner {
        emit RelayerUpdated(relayer, newRelayer);
        relayer = newRelayer;
    }

    /// @notice Imports an existing product and all its service/claim records
    ///         from the immutable legacy deployment. Restricted to the
    ///         contract owner; the legacy contract remains the source of truth
    ///         for the values being copied. Product keys cannot be duplicated.
    function migrateProduct(bytes32 productKey)
        external
        onlyContractOwner
    {
        ILegacyBlockWarranty legacy = ILegacyBlockWarranty(migrationSource);
        require(migrationOpen, "Migration is closed");
        require(migrationSource != address(0), "Migration is disabled");
        require(legacy.productExists(productKey), "Legacy product does not exist");
        require(products[productKey].currentOwner == address(0), "Product already migrated");

        ILegacyBlockWarranty.Product memory oldProduct = legacy.getProduct(productKey);
        products[productKey] = Product({
            productKey: oldProduct.productKey,
            serialNumberHash: oldProduct.serialNumberHash,
            currentOwner: oldProduct.currentOwner,
            registeredAt: oldProduct.registeredAt,
            purchaseDate: oldProduct.purchaseDate,
            warrantyStart: oldProduct.warrantyStart,
            warrantyExpiry: oldProduct.warrantyExpiry,
            status: ProductStatus(oldProduct.status),
            metadataHash: oldProduct.metadataHash
        });
        emit ProductRegistered(productKey, oldProduct.currentOwner, oldProduct.serialNumberHash,
            oldProduct.purchaseDate, oldProduct.warrantyStart, oldProduct.warrantyExpiry, oldProduct.metadataHash);

        uint256 services = legacy.getServiceCount(productKey);
        for (uint256 i; i < services; ++i) {
            ILegacyBlockWarranty.ServiceRecord memory item = legacy.getService(productKey, i);
            serviceRecords[productKey].push(ServiceRecord(item.serviceId, item.timestamp, item.serviceProvider, item.descriptionHash));
            emit ServiceRecorded(productKey, item.serviceId, item.serviceProvider, item.descriptionHash, item.timestamp);
        }

        uint256 claims = legacy.getClaimCount(productKey);
        for (uint256 i; i < claims; ++i) {
            ILegacyBlockWarranty.WarrantyClaim memory item = legacy.getWarrantyClaim(productKey, i);
            warrantyClaims[productKey].push(WarrantyClaim(item.claimId, item.timestamp, item.claimant, item.descriptionHash, item.approved));
            emit WarrantyClaimRecorded(productKey, item.claimId, item.claimant, item.descriptionHash, item.approved, item.timestamp);
        }

        emit ProductMigrated(productKey, oldProduct.currentOwner, migrationSource);
    }

    /// @notice Permanently closes the one-time legacy import path after
    ///         migration has been verified.
    function closeMigration() external onlyContractOwner {
        migrationOpen = false;
        emit MigrationClosed();
    }

    // ============================================================
    // INTERNAL HELPERS
    // ============================================================

    /// @dev Ensures a timestamp fits safely into uint64.
    function _toUint64(uint256 value) internal pure returns (uint64) {
        require(value <= type(uint64).max, "Value exceeds uint64 range");
        return uint64(value);
    }

    // ============================================================
    // PRODUCT REGISTRATION
    // ============================================================

    /// @notice Registers a new product on-chain.
    /// @dev    productKey must be unique and non-zero. msg.sender becomes
    ///         the initial owner. All timestamps are validated and
    ///         downcast to uint64 safely.
    /// @param  productKey       Unique product identifier.
    /// @param  serialNumberHash Hash of the product's serial number.
    /// @param  purchaseDate     Purchase timestamp (seconds).
    /// @param  warrantyStart    Warranty start timestamp (seconds).
    /// @param  warrantyExpiry   Warranty expiry timestamp (seconds).
    /// @param  metadataHash     Off-chain metadata / document reference.
    function registerProduct(
        bytes32 productKey,
        bytes32 serialNumberHash,
        uint256 purchaseDate,
        uint256 warrantyStart,
        uint256 warrantyExpiry,
        bytes32 metadataHash
    ) external {
        require(productKey != bytes32(0), "Invalid product key");
        require(
            products[productKey].currentOwner == address(0),
            "Product already registered"
        );
        require(serialNumberHash != bytes32(0), "Invalid serial hash");
        require(
            warrantyExpiry >= warrantyStart,
            "Invalid warranty dates"
        );
        require(
            warrantyStart >= purchaseDate,
            "Warranty cannot start before purchase"
        );

        uint64 _registeredAt = uint64(block.timestamp);
        uint64 _purchaseDate = _toUint64(purchaseDate);
        uint64 _warrantyStart = _toUint64(warrantyStart);
        uint64 _warrantyExpiry = _toUint64(warrantyExpiry);

        products[productKey] = Product({
            productKey: productKey,
            serialNumberHash: serialNumberHash,
            currentOwner: msg.sender,
            registeredAt: _registeredAt,
            purchaseDate: _purchaseDate,
            warrantyStart: _warrantyStart,
            warrantyExpiry: _warrantyExpiry,
            status: ProductStatus.Active,
            metadataHash: metadataHash
        });

        emit ProductRegistered(
            productKey,
            msg.sender,
            serialNumberHash,
            purchaseDate,
            warrantyStart,
            warrantyExpiry,
            metadataHash
        );
    }

    // ============================================================
    // PRODUCT READ FUNCTIONS
    // ============================================================

    /// @notice Returns true if a product is registered under productKey.
    function productExists(
        bytes32 productKey
    ) external view returns (bool) {
        return products[productKey].currentOwner != address(0);
    }

    /// @notice Returns the full Product struct for a registered product.
    /// @dev    Reverts if the product does not exist.
    function getProduct(
        bytes32 productKey
    ) external view productMustExist(productKey) returns (Product memory) {
        return products[productKey];
    }

    // ============================================================
    // OWNERSHIP MANAGEMENT
    // ============================================================

    /// @notice Transfers ownership of a product to a new wallet.
    /// @dev    Only the current owner may call. The product status is NOT
    ///         changed — ownership transfer is an ownership event, not a
    ///         lifecycle state change.
    /// @param  productKey The product to transfer.
    /// @param  newOwner   The address of the new owner.
    function transferOwnership(
        bytes32 productKey,
        address newOwner
    )
        external
        productMustExist(productKey)
        onlyProductOwner(productKey)
    {
        require(newOwner != address(0), "Invalid new owner");
        require(newOwner != msg.sender, "Already the owner");

        address previousOwner = products[productKey].currentOwner;
        products[productKey].currentOwner = newOwner;

        emit OwnershipTransferred(productKey, previousOwner, newOwner);
    }

    /// @notice Relayer-authorized ownership transfer for a verified sale.
    /// @dev    Callable only by the authorized backend relayer, which invokes
    ///         this ONLY after a server-side Razorpay payment has been verified
    ///         for this exact (product, buyer) pair. The same ownership rules
    ///         apply as `transferOwnership`: the product must exist and the new
    ///         owner must be a different, non-zero address. It also emits the
    ///         canonical `OwnershipTransferred` event so existing off-chain
    ///         verification is unchanged, plus a relayer-specific event for
    ///         auditability. The product status is intentionally NOT changed —
    ///         ownership transfer is an ownership event, not a lifecycle change.
    /// @param  productKey The product to transfer.
    /// @param  newOwner   The address of the new owner (the verified buyer).
    function transferOwnershipByRelayer(
        bytes32 productKey,
        address newOwner
    )
        external
        productMustExist(productKey)
        onlyRelayer()
    {
        require(newOwner != address(0), "Invalid new owner");
        address previousOwner = products[productKey].currentOwner;
        require(newOwner != previousOwner, "Already the owner");

        products[productKey].currentOwner = newOwner;

        emit OwnershipTransferred(productKey, previousOwner, newOwner);
        emit OwnershipTransferredByRelayer(productKey, previousOwner, newOwner, msg.sender);
    }

    // ============================================================
    // WARRANTY MANAGEMENT
    // ============================================================

    /// @notice Updates the warranty period for a product.
    /// @dev    Only the current owner may call. Timestamps are validated
    ///         and safely downcast to uint64.
    /// @param  productKey      The product whose warranty is being updated.
    /// @param  warrantyStart   New warranty start timestamp.
    /// @param  warrantyExpiry New warranty expiry timestamp.
    function updateWarranty(
        bytes32 productKey,
        uint256 warrantyStart,
        uint256 warrantyExpiry
    )
        external
        productMustExist(productKey)
        onlyProductOwner(productKey)
    {
        require(
            warrantyExpiry >= warrantyStart,
            "Invalid warranty dates"
        );

        products[productKey].warrantyStart = _toUint64(warrantyStart);
        products[productKey].warrantyExpiry = _toUint64(warrantyExpiry);

        emit WarrantyUpdated(productKey, warrantyStart, warrantyExpiry);
    }

    /// @notice Returns true if the product's warranty is currently active.
    /// @dev    Warranty is active when block.timestamp is within
    ///         [warrantyStart, warrantyExpiry] inclusive.
    function isWarrantyActive(
        bytes32 productKey
    ) external view productMustExist(productKey) returns (bool) {
        Product memory product = products[productKey];
        return
            block.timestamp >= product.warrantyStart &&
            block.timestamp <= product.warrantyExpiry;
    }

    // ============================================================
    // SERVICE / REPAIR RECORDS
    // ============================================================

    /// @notice Records a service / repair entry for a product.
    /// @dev    Only the current owner may call. serviceId is auto-generated
    ///         from the current array length (sequential, zero-based).
    /// @param  productKey      The product being serviced.
    /// @param  descriptionHash Hash of the off-chain service description.
    function recordService(
        bytes32 productKey,
        bytes32 descriptionHash
    )
        external
        productMustExist(productKey)
        onlyProductOwner(productKey)
    {
        require(descriptionHash != bytes32(0), "Invalid description hash");

        uint256 serviceId = serviceRecords[productKey].length;

        serviceRecords[productKey].push(
            ServiceRecord({
                serviceId: serviceId,
                timestamp: block.timestamp,
                serviceProvider: msg.sender,
                descriptionHash: descriptionHash
            })
        );

        emit ServiceRecorded(
            productKey,
            serviceId,
            msg.sender,
            descriptionHash,
            block.timestamp
        );
    }

    /// @notice Returns the number of service records for a product.
    function getServiceCount(
        bytes32 productKey
    ) external view productMustExist(productKey) returns (uint256) {
        return serviceRecords[productKey].length;
    }

    /// @notice Returns a specific service record by index.
    /// @dev    Reverts if the serviceId is out of range.
    function getService(
        bytes32 productKey,
        uint256 serviceId
    )
        external
        view
        productMustExist(productKey)
        returns (ServiceRecord memory)
    {
        require(
            serviceId < serviceRecords[productKey].length,
            "Service record not found"
        );
        return serviceRecords[productKey][serviceId];
    }

    // ============================================================
    // WARRANTY CLAIMS
    // ============================================================

    /// @notice Records a warranty claim for a product.
    /// @dev    Only the current owner may call. claimId is auto-generated
    ///         from the current array length (sequential, zero-based).
    ///         If approved is true, the product status is set to Claimed.
    /// @param  productKey      The product for which the claim is filed.
    /// @param  descriptionHash Hash of the off-chain claim description.
    /// @param  approved        Whether the claim is approved.
    function recordWarrantyClaim(
        bytes32 productKey,
        bytes32 descriptionHash,
        bool approved
    )
        external
        productMustExist(productKey)
        onlyProductOwner(productKey)
    {
        require(descriptionHash != bytes32(0), "Invalid description hash");

        uint256 claimId = warrantyClaims[productKey].length;

        warrantyClaims[productKey].push(
            WarrantyClaim({
                claimId: claimId,
                timestamp: block.timestamp,
                claimant: msg.sender,
                descriptionHash: descriptionHash,
                approved: approved
            })
        );

        if (approved) {
            products[productKey].status = ProductStatus.Claimed;
        }

        emit WarrantyClaimRecorded(
            productKey,
            claimId,
            msg.sender,
            descriptionHash,
            approved,
            block.timestamp
        );
    }

    /// @notice Returns the number of warranty claims for a product.
    function getClaimCount(
        bytes32 productKey
    ) external view productMustExist(productKey) returns (uint256) {
        return warrantyClaims[productKey].length;
    }

    /// @notice Returns a specific warranty claim by index.
    /// @dev    Reverts if the claimId is out of range.
    function getWarrantyClaim(
        bytes32 productKey,
        uint256 claimId
    )
        external
        view
        productMustExist(productKey)
        returns (WarrantyClaim memory)
    {
        require(
            claimId < warrantyClaims[productKey].length,
            "Warranty claim not found"
        );
        return warrantyClaims[productKey][claimId];
    }
}
