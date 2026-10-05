// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract BlockWarrantyLifecycle {
    enum Status { Unregistered, Active, Expired, Transferred }
    struct Product { address currentOwner; uint64 warrantyStart; uint64 warrantyExpiry; uint64 registeredAt; Status status; }
    mapping(bytes32 => Product) private products;
    mapping(bytes32 => bool) private serviceRecorded;
    event ProductRegistered(bytes32 indexed productKey, address indexed owner, uint64 warrantyStart, uint64 warrantyExpiry, uint64 timestamp);
    event OwnershipTransferred(bytes32 indexed productKey, address indexed previousOwner, address indexed newOwner, uint64 timestamp);
    event ServiceRecorded(bytes32 indexed productKey, bytes32 indexed serviceKey, bytes32 documentHash, bytes32 detailsHash, uint64 serviceDate, uint64 timestamp);
    event WarrantyClaimRecorded(bytes32 indexed productKey, bytes32 indexed claimKey, bytes32 documentHash, bytes32 detailsHash, uint64 claimDate, uint64 timestamp);
    modifier onlyOwner(bytes32 key) { require(products[key].currentOwner == msg.sender, "Not product owner"); _; }
    function registerProduct(bytes32 key, uint64 warrantyStart, uint64 warrantyExpiry) external {
        require(key != bytes32(0), "Empty product key"); require(products[key].currentOwner == address(0), "Already registered");
        require(warrantyExpiry == 0 || warrantyExpiry >= warrantyStart, "Invalid warranty dates");
        products[key] = Product(msg.sender, warrantyStart, warrantyExpiry, uint64(block.timestamp), Status.Active);
        emit ProductRegistered(key, msg.sender, warrantyStart, warrantyExpiry, uint64(block.timestamp));
    }
    function transferOwnership(bytes32 key, address newOwner) external onlyOwner(key) {
        require(newOwner != address(0) && newOwner != msg.sender, "Invalid new owner"); address previous = msg.sender;
        products[key].currentOwner = newOwner; products[key].status = Status.Transferred;
        emit OwnershipTransferred(key, previous, newOwner, uint64(block.timestamp));
    }
    function recordService(bytes32 key, bytes32 serviceKey, bytes32 documentHash, bytes32 detailsHash, uint64 serviceDate) external onlyOwner(key) {
        require(!serviceRecorded[serviceKey] && serviceKey != bytes32(0), "Service already recorded"); serviceRecorded[serviceKey] = true;
        emit ServiceRecorded(key, serviceKey, documentHash, detailsHash, serviceDate, uint64(block.timestamp));
    }
    function recordWarrantyClaim(bytes32 key, bytes32 claimKey, bytes32 documentHash, bytes32 detailsHash, uint64 claimDate) external onlyOwner(key) {
        require(!serviceRecorded[claimKey] && claimKey != bytes32(0), "Claim already recorded"); serviceRecorded[claimKey] = true;
        emit WarrantyClaimRecorded(key, claimKey, documentHash, detailsHash, claimDate, uint64(block.timestamp));
    }
    function getProduct(bytes32 key) external view returns (Product memory) { return products[key]; }
}
