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
