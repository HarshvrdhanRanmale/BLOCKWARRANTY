const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

// Temporary UI-only fixtures. Replace these functions with wallet and API adapters later.
const mockWallet = {
  address: "0x7A34F8C91234ABCDEF5678901234567892F1",
  recoveryPhrase: [
    "river",
    "cloud",
    "wallet",
    "blue",
    "secure",
    "block",
    "future",
    "digital",
    "trust",
    "chain",
    "product",
    "owner",
  ],
};

export async function createWallet() {
  await delay(1200);
  return { ...mockWallet, recoveryPhrase: [...mockWallet.recoveryPhrase] };
}

export async function connectWallet() {
  await delay(1100);
  return mockWallet.address;
}

export async function authenticateWallet({ onStatus }) {
  onStatus("signing");
  await delay(1100);
  onStatus("verifying");
  await delay(1200);
  return { authenticated: true };
}
