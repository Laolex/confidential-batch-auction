/**
 * Resume e2e from market #1 — bets already placed, epoch still open.
 * Waits for epoch close, then resolves, requests pool reveal, requests payouts.
 */

import { ethers } from "ethers";

const RPC_URL   = "https://ethereum-sepolia-rpc.publicnode.com";
const RPC_URL_2 = "https://sepolia.infura.io/v3/f0e9af63d05c4f25b758d24320d7959c";
const PRIVATE_KEY = "0xf62185cc6ab67626408323147263e67c34b42fb6e148c0367a84aa46790932af";
const MNEMONIC    = "all enforce artist material arrive web draw crucial pair pair pipe pole";
const CONTRACT    = "0x1Fe1Dc91396ECBEF7e2B59643A94D2C9277b9fd6";
const MARKET_ID   = 1n;

const ABI = [
  "event PoolRevealed(uint256 indexed marketId, uint256 yesPool, uint256 noPool, uint256 clearingPrice)",
  "event PayoutClaimed(uint256 indexed marketId, address indexed bettor, uint256 payout)",
  "function resolveMarket(uint256 marketId, uint8 outcome) external",
  "function requestPoolReveal(uint256 marketId) external",
  "function requestPayout(uint256 marketId) external",
  "function getMarket(uint256 marketId) external view returns (address creator, string question, uint64 epochStart, uint64 epochEnd, bool resolved, uint8 outcome, uint256 totalEth, uint256 revealedYesPool, uint256 revealedNoPool, uint256 clearingPrice, bool poolRevealRequested, bool poolRevealed, address priceFeed, int256 strikePrice, bool useOracle)",
  "function getPosition(uint256 marketId, address bettor) external view returns (uint256 amount, bool payoutRequested, bool claimed)",
];

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }
async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitFor(label, check, pollMs = 10000, timeoutMs = 600_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) { log(`✓ ${label}`); return result; }
    log(`  … waiting for ${label}`);
    await wait(pollMs);
  }
  throw new Error(`Timeout: ${label}`);
}

async function main() {
  const provider = new ethers.FallbackProvider([
    { provider: new ethers.JsonRpcProvider(RPC_URL),   priority: 1, weight: 1 },
    { provider: new ethers.JsonRpcProvider(RPC_URL_2), priority: 2, weight: 1 },
  ], 11155111);

  const wallet1 = new ethers.Wallet(PRIVATE_KEY, provider);
  const wallet2 = ethers.HDNodeWallet.fromPhrase(MNEMONIC, undefined, "m/44'/60'/0'/0/1").connect(provider);

  log(`W1 (creator/YES): ${wallet1.address}`);
  log(`W2 (NO bettor):   ${wallet2.address}`);

  const c1 = new ethers.Contract(CONTRACT, ABI, wallet1);
  const c2 = new ethers.Contract(CONTRACT, ABI, wallet2);

  // ── Wait for epoch close ──────────────────────────────────────────────────
  const market = await c1.getMarket(MARKET_ID);
  const epochEnd = Number(market.epochEnd);
  const secsLeft = epochEnd - Math.floor(Date.now() / 1000);
  if (secsLeft > 0) {
    log(`Epoch closes in ${secsLeft}s (${new Date(epochEnd * 1000).toISOString()}) — waiting…`);
    await wait((secsLeft + 3) * 1000);
  }
  log("Epoch closed.");

  // ── Resolve: YES wins ─────────────────────────────────────────────────────
  log("Resolving market (outcome=YES=1)…");
  const resolveTx = await c1.resolveMarket(MARKET_ID, 1);
  await resolveTx.wait();
  log(`Resolved. tx: ${resolveTx.hash}`);

  // ── Request pool reveal ───────────────────────────────────────────────────
  log("Requesting pool reveal…");
  const rrTx = await c1.requestPoolReveal(MARKET_ID);
  await rrTx.wait();
  log(`Pool reveal requested. tx: ${rrTx.hash}`);
  log("Keeper should pick this up within ~30s…");

  await waitFor("pool revealed by keeper", async () => {
    const m = await c1.getMarket(MARKET_ID);
    return m.poolRevealed;
  });

  const m2 = await c1.getMarket(MARKET_ID);
  log(`Pool revealed — YES pool: ${m2.revealedYesPool} gwei, NO pool: ${m2.revealedNoPool} gwei`);

  // ── Request payouts ───────────────────────────────────────────────────────
  log("W1 requesting payout…");
  const p1Tx = await c1.requestPayout(MARKET_ID);
  await p1Tx.wait();
  log(`W1 payout requested. tx: ${p1Tx.hash}`);

  log("W2 requesting payout…");
  const p2Tx = await c2.requestPayout(MARKET_ID);
  await p2Tx.wait();
  log(`W2 payout requested. tx: ${p2Tx.hash}`);

  log("Waiting for keeper to settle both payouts…");

  await waitFor("W1 payout claimed", async () => {
    const pos = await c1.getPosition(MARKET_ID, wallet1.address);
    return pos.claimed;
  });

  await waitFor("W2 payout claimed", async () => {
    const pos = await c1.getPosition(MARKET_ID, wallet2.address);
    return pos.claimed;
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  const pos1 = await c1.getPosition(MARKET_ID, wallet1.address);
  const pos2 = await c1.getPosition(MARKET_ID, wallet2.address);
  const bal1  = await provider.getBalance(wallet1.address);
  const bal2  = await provider.getBalance(wallet2.address);

  console.log("\n══════════════════════════════════════════════════");
  console.log("  E2E TEST COMPLETE");
  console.log("══════════════════════════════════════════════════");
  console.log(`  Market #${MARKET_ID} — YES wins (pari-mutuel)`);
  console.log(`  W1 (YES) — claimed: ${pos1.claimed} | bal: ${ethers.formatEther(bal1)} ETH`);
  console.log(`  W2 (NO)  — claimed: ${pos2.claimed} | bal: ${ethers.formatEther(bal2)} ETH`);
  console.log("══════════════════════════════════════════════════\n");
}

main().catch(err => { console.error("[FATAL]", err.shortMessage ?? err.message); process.exit(1); });
