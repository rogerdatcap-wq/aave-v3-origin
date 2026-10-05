const ETHEREUM_MAINNET = {
  provider: "0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e",
};

const STORAGE_KEY = "aave-protocol-explorer.provider";
const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;
const MASK_64 = (1n << 64n) - 1n;
const KECCAK_RATE = 136;
const ROTATION_OFFSETS = [
  0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14,
];
const ROUND_CONSTANTS = [
  0x0000000000000001n,
  0x0000000000008082n,
  0x800000000000808an,
  0x8000000080008000n,
  0x000000000000808bn,
  0x0000000080000001n,
  0x8000000080008081n,
  0x8000000000008009n,
  0x000000000000008an,
  0x0000000000000088n,
  0x0000000080008009n,
  0x000000008000000an,
  0x000000008000808bn,
  0x800000000000008bn,
  0x8000000000008089n,
  0x8000000000008003n,
  0x8000000000008002n,
  0x8000000000000080n,
  0x000000000000800an,
  0x800000008000000an,
  0x8000000080008081n,
  0x8000000000008080n,
  0x0000000080000001n,
  0x8000000080008008n,
];

const form = document.querySelector("#market-form");
const providerInput = document.querySelector("#provider-address");
const loadButton = document.querySelector("#load-market");
const connectButton = document.querySelector("#connect-wallet");
const connectionState = document.querySelector("#connection-state");
const message = document.querySelector("#message");
const marketPanel = document.querySelector("#market-panel");
const reserveRows = document.querySelector("#reserve-rows");

providerInput.value = localStorage.getItem(STORAGE_KEY) || ETHEREUM_MAINNET.provider;

function rotateLeft64(value, shift) {
  if (shift === 0) return value & MASK_64;
  const amount = BigInt(shift);
  return ((value << amount) | (value >> (64n - amount))) & MASK_64;
}

function keccakPermutation(state) {
  for (const roundConstant of ROUND_CONSTANTS) {
    const columns = new Array(5);
    for (let x = 0; x < 5; x += 1) {
      columns[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    }

    const deltas = columns.map(
      (column, x) => columns[(x + 4) % 5] ^ rotateLeft64(columns[(x + 1) % 5], 1)
    );
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        state[x + 5 * y] ^= deltas[x];
      }
    }

    const moved = new Array(25).fill(0n);
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        const destinationX = y;
        const destinationY = (2 * x + 3 * y) % 5;
        moved[destinationX + 5 * destinationY] = rotateLeft64(
          state[x + 5 * y],
          ROTATION_OFFSETS[x + 5 * y]
        );
      }
    }

    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        state[x + 5 * y] =
          moved[x + 5 * y] ^
          (~moved[((x + 1) % 5) + 5 * y] & moved[((x + 2) % 5) + 5 * y]);
      }
    }
    state[0] ^= roundConstant;
  }
}

function keccak256(bytes) {
  const state = new Array(25).fill(0n);
  const paddedLength = Math.ceil((bytes.length + 1) / KECCAK_RATE) * KECCAK_RATE;
  const padded = new Uint8Array(paddedLength || KECCAK_RATE);
  padded.set(bytes);
  padded[bytes.length] ^= 0x01;
  padded[padded.length - 1] ^= 0x80;

  for (let block = 0; block < padded.length; block += KECCAK_RATE) {
    for (let byteIndex = 0; byteIndex < KECCAK_RATE; byteIndex += 1) {
      const lane = Math.floor(byteIndex / 8);
      const shift = BigInt((byteIndex % 8) * 8);
      state[lane] ^= BigInt(padded[block + byteIndex]) << shift;
    }
    keccakPermutation(state);
  }

  const digest = new Uint8Array(32);
  for (let byteIndex = 0; byteIndex < digest.length; byteIndex += 1) {
    const lane = state[Math.floor(byteIndex / 8)];
    digest[byteIndex] = Number((lane >> BigInt((byteIndex % 8) * 8)) & 0xffn);
  }
  return digest;
}

function functionSelector(signature) {
  const bytes = new TextEncoder().encode(signature);
  return `0x${Array.from(keccak256(bytes).slice(0, 4), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")}`;
}

function assertKeccakImplementation() {
  const emptyHash = Array.from(keccak256(new Uint8Array()), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  if (emptyHash !== "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470") {
    throw new Error("Unable to initialize the Ethereum ABI encoder.");
  }
}

function setMessage(text, kind = "info") {
  message.textContent = text;
  message.dataset.kind = kind;
}

function shortAddress(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function chainName(chainId) {
  const names = {
    "0x1": "Ethereum Mainnet",
    "0xaa36a7": "Sepolia",
    "0x89": "Polygon",
    "0xa4b1": "Arbitrum One",
    "0xa": "Optimism",
    "0x2105": "Base",
    "0x539": "Localhost",
    "0x7a69": "Localhost",
  };
  return names[chainId.toLowerCase()] || `Chain ${BigInt(chainId).toString()}`;
}

function requireWallet() {
  if (!window.ethereum?.request) {
    throw new Error("No EVM wallet was detected. Install or enable a browser wallet to continue.");
  }
  return window.ethereum;
}

async function rpcCall(to, data) {
  return requireWallet().request({
    method: "eth_call",
    params: [{ to, data }, "latest"],
  });
}

function wordAt(data, wordIndex) {
  const start = 2 + wordIndex * 64;
  const word = data.slice(start, start + 64);
  if (word.length !== 64) throw new Error("The market returned malformed contract data.");
  return BigInt(`0x${word}`);
}

function addressFromWord(data, wordIndex) {
  const start = 2 + wordIndex * 64;
  const word = data.slice(start, start + 64);
  if (word.length !== 64) throw new Error("The market returned a malformed address.");
  return `0x${word.slice(24)}`;
}

function decodeString(data) {
  const offset = Number(wordAt(data, 0));
  if (offset % 32 !== 0 || offset < 32 || offset > (data.length - 2) / 2) {
    const firstWord = data.slice(2, 66);
    if (firstWord.length !== 64) return "Unknown";
    const bytes = new Uint8Array(
      firstWord.match(/.{2}/g).map((byte) => Number.parseInt(byte, 16))
    );
    return new TextDecoder().decode(bytes).replace(/\0+$/, "") || "Unknown";
  }

  const length = Number(BigInt(`0x${data.slice(2 + offset * 2, 2 + (offset + 32) * 2)}`));
  if (!Number.isSafeInteger(length) || length < 0 || length > 128) {
    throw new Error("The token returned an invalid symbol.");
  }
  const start = 2 + (offset + 32) * 2;
  const symbolHex = data.slice(start, start + length * 2);
  if (symbolHex.length !== length * 2) throw new Error("The token returned a malformed symbol.");
  return new TextDecoder().decode(
    new Uint8Array(symbolHex.match(/.{2}/g).map((byte) => Number.parseInt(byte, 16)))
  );
}

async function readToken(asset) {
  const [symbolResult, decimalsResult] = await Promise.all([
    rpcCall(asset, functionSelector("symbol()")),
    rpcCall(asset, functionSelector("decimals()")),
  ]);
  const decimals = Number(BigInt(decimalsResult));
  if (!Number.isInteger(decimals) || decimals > 255) {
    throw new Error(`Token ${shortAddress(asset)} returned invalid decimals.`);
  }
  return { address: asset, symbol: decodeString(symbolResult), decimals };
}

async function readMarket(providerAddress) {
  assertKeccakImplementation();
  const poolResult = await rpcCall(providerAddress, functionSelector("getPool()"));
  const poolAddress = addressFromWord(poolResult, 0);
  if (/^0x0{40}$/i.test(poolAddress)) {
    throw new Error("This Addresses Provider has no Pool configured on the selected network.");
  }

  const reservesResult = await rpcCall(poolAddress, functionSelector("getReservesList()"));
  const arrayOffset = Number(wordAt(reservesResult, 0));
  if (arrayOffset % 32 !== 0 || arrayOffset < 32) {
    throw new Error("The Pool returned an invalid reserve list.");
  }
  const reserveCount = Number(wordAt(reservesResult, arrayOffset / 32));
  const maxReserves = 256;
  if (!Number.isSafeInteger(reserveCount) || reserveCount > maxReserves) {
    throw new Error("The Pool returned an unsupported reserve count.");
  }
  if ((arrayOffset / 32 + reserveCount + 1) * 64 + 2 > reservesResult.length) {
    throw new Error("The Pool returned an incomplete reserve list.");
  }

  const reserves = [];
  for (let i = 0; i < reserveCount; i += 1) {
    reserves.push(addressFromWord(reservesResult, arrayOffset / 32 + 1 + i));
  }

  const tokens = [];
  for (let i = 0; i < reserves.length; i += 5) {
    const batch = await Promise.all(reserves.slice(i, i + 5).map(readToken));
    tokens.push(...batch);
  }
  return { poolAddress, tokens };
}

function renderMarket({ poolAddress, tokens }, chainId) {
  document.querySelector("#network-name").textContent = chainName(chainId);
  document.querySelector("#pool-address").textContent = poolAddress;
  document.querySelector("#reserve-count").textContent =
    `${tokens.length} ${tokens.length === 1 ? "asset" : "assets"}`;
  reserveRows.replaceChildren();

  if (tokens.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 3;
    cell.className = "empty-state";
    cell.textContent = "No reserves are configured for this market.";
    row.append(cell);
    reserveRows.append(row);
  } else {
    for (const token of tokens) {
      const row = document.createElement("tr");
      const symbolCell = document.createElement("td");
      const addressCell = document.createElement("td");
      const decimalsCell = document.createElement("td");
      const address = document.createElement("code");
      symbolCell.textContent = token.symbol;
      address.textContent = token.address;
      addressCell.append(address);
      decimalsCell.textContent = String(token.decimals);
      row.append(symbolCell, addressCell, decimalsCell);
      reserveRows.append(row);
    }
  }
  marketPanel.hidden = false;
}

async function connectWallet() {
  const wallet = requireWallet();
  const accounts = await wallet.request({ method: "eth_requestAccounts" });
  if (!accounts.length) throw new Error("The wallet did not return an account.");
  const chainId = await wallet.request({ method: "eth_chainId" });
  connectionState.textContent = `${shortAddress(accounts[0])} · ${chainName(chainId)}`;
  connectButton.textContent = shortAddress(accounts[0]);
}

async function handleLoadMarket(event) {
  event.preventDefault();
  const providerAddress = providerInput.value.trim();
  if (!ADDRESS_REGEX.test(providerAddress)) {
    setMessage("Enter a valid 0x-prefixed Pool Addresses Provider address.", "error");
    providerInput.focus();
    return;
  }

  loadButton.disabled = true;
  marketPanel.hidden = true;
  setMessage("Reading the Addresses Provider and reserve tokens…");
  localStorage.setItem(STORAGE_KEY, providerAddress);
  try {
    const wallet = requireWallet();
    const chainId = await wallet.request({ method: "eth_chainId" });
    const market = await readMarket(providerAddress);
    renderMarket(market, chainId);
    setMessage(`Loaded ${market.tokens.length} reserve tokens from ${shortAddress(market.poolAddress)}.`);
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "Unable to load this market.", "error");
  } finally {
    loadButton.disabled = false;
  }
}

connectButton.addEventListener("click", async () => {
  connectButton.disabled = true;
  try {
    await connectWallet();
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "Unable to connect the wallet.", "error");
  } finally {
    connectButton.disabled = false;
  }
});

form.addEventListener("submit", handleLoadMarket);

if (window.ethereum?.on) {
  window.ethereum.on("accountsChanged", (accounts) => {
    connectionState.textContent = accounts.length ? shortAddress(accounts[0]) : "Wallet not connected";
    connectButton.textContent = accounts.length ? shortAddress(accounts[0]) : "Connect wallet";
  });
  window.ethereum.on("chainChanged", () => window.location.reload());
}
