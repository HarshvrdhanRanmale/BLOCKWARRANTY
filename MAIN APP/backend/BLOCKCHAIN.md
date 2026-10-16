# BlockWarranty local demo blockchain

The application now uses `backend/contracts/BlockWarrantyLifecycle.sol` for product registration, warranty dates, ownership transfers, service entries, and warranty claims. Only product keys, wallet ownership, lifecycle dates/status, and document/details hashes are written on-chain. The actual invoices and service documents stay in MongoDB GridFS.

For a no-cost demo on this computer (recommended for showing the app locally):

1. Start Ganache from `backend` with `npm run chain:start`. It uses chain ID 31337 and keeps its data in `backend/chain-data-demo`.
2. The already deployed demo contract is configured in `backend/.env`. If the chain database is reset, run `npm run chain:deploy:local` and restart the backend.
3. Run `npm run dev` from `backend` and `npm run dev` from `frontend`. Each Google account has its own wallet/user record; the development flow funds local demo wallets automatically for gas.
4. The Vite dev server proxies `/api` through its own port to the backend. The embedded wallet's local RPC therefore uses `http://localhost:5173/api/blockchain/rpc`, which also works when the browser cannot directly reach the computer's Ganache port.
4. The current local frontend QR URL is configured in `frontend/.env` as `VITE_PUBLIC_APP_URL`. Set that variable to the deployed HTTPS site origin in production; the frontend will not silently substitute its current browser origin.

Users sign lifecycle transactions with their connected wallet. The backend verifies the mined contract event before showing a record as confirmed. A polling sync process replays contract events into MongoDB after restarts. QR passport APIs read warranty/ownership state from the contract and return an explicit public projection; private invoices are never available through public QR links.

This local chain is visible only to the app running on this computer; it is not a public blockchain. For a public demo, configure Sepolia in both `.env` files, deploy the contract there, and fund each demo wallet with Sepolia test ETH.

## Transfer requests

Authenticated transfer requests are stored in MongoDB by product ID and the seller/buyer wallet addresses from the signature-authenticated session. `GET /api/transfers/products` checks each listed product against `getProduct(bytes32).currentOwner`; sent, received, detail, and history APIs are filtered by the authenticated wallet. An intended buyer may review the existing invoice through the product invoice endpoint while the request is pending or accepted; the file stays attached to the same product passport.

## Automatic Razorpay transfer and legacy contract migration

The currently configured Sepolia contract must expose `relayer()`, `setRelayer()`, and `transferOwnershipByRelayer(bytes32,address)` for automatic paid transfers. The migration-enabled source contract pins the existing deployment as `migrationSource`; only its contract owner can import products, including service and warranty-claim history. The import path can be permanently closed after migration.

To prepare a deployment, put a dedicated low-value relayer private key in `RELAYER_PRIVATE_KEY` and a separately controlled Sepolia deployer key in `SEPOLIA_DEPLOYER_PRIVATE_KEY`, both in `MAIN APP/backend/.env`. Never commit either key or paste it into chat. Compile from the repository root with `npx hardhat compile`, deploy with `npm run chain:deploy` from the backend directory, then set `MIGRATION_TARGET_ADDRESS` to the newly deployed address and run `npm run chain:migrate`. Update/restart the application with that contract address; the frontend reads `VITE_BLOCKWARRANTY_CONTRACT_ADDRESS` from its environment.

Deployment and migration are separate Sepolia transactions and require Sepolia ETH. The migration script imports every MongoDB product that exists on the old chain, copies the current on-chain owner plus product, service, and claim fields, then closes further imports. Existing passport files and off-chain documents stay in MongoDB. Ownership-history entries remain in MongoDB; the old contract remains available as the prior event source. Do not switch the live app to the new contract until deployment and migration have both been confirmed.

The current contract supports `transferOwnership(bytes32,address)` and emits `OwnershipTransferred`, but it does not support sale payment or on-chain request, acceptance, rejection, or cancellation methods. Accepting a request only records an off-chain response and does not change ownership. After acceptance, the seller submits the direct MetaMask ownership transaction; the backend only marks the request complete after verifying the confirmed event and final on-chain owner. The agreed price is request metadata, not verified or collected payment. No contract redeployment is needed for this flow, but frontend/backend network and contract-address configuration must refer to the same deployment.
