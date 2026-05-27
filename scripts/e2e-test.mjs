/**
 * End-to-end test for ConfidentialBatchAuction on Sepolia.
 *
 * Flow:
 *   1. Wallet1 (creator) creates a 3-min market
 *   2. Wallet1 places YES bet (0.005 ETH)
 *   3. Wallet2 (derived from mnemonic) places NO bet (0.003 ETH)
 *   4. Wait for epoch to close
 *   5. Wallet1 (creator) resolves: YES wins
 *   6. requestPoolReveal → keeper handles onPoolRevealed
 *   7. Both wallets requestPayout → keeper handles onPayoutRevealed
 *   8. Confirm PayoutClaimed events and final balances
 */

import { ethers } from "ethers";
import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk/node";

// ── Config ──────────────────────────────────────────────────────────────────
const RPC_URL     = "https://sepolia.infura.io/v3/f0e9af63d05c4f25b758d24320d7959c";
const PRIVATE_KEY = "0xf62185cc6ab67626408323147263e67c34b42fb6e148c0367a84aa46790932af";
const MNEMONIC    = "all enforce artist material arrive web draw crucial pair pair pipe pole";
const CONTRACT    = "0x1Fe1Dc91396ECBEF7e2B59643A94D2C9277b9fd6";

const EPOCH_SECONDS = 180; // 3 minutes — short enough to test, long enough to bet
const YES_BET = ethers.parseEther("0.005");
const NO_BET  = ethers.parseEther("0.003");
const SIDE_YES = 1n;
const SIDE_NO  = 0n;

const ABI = [
  "event MarketCreated(uint256 indexed marketId, address creator, string question, uint64 epochStart, uint64 epochEnd)",
  "event PoolRevealRequested(uint256 indexed marketId, bytes32[2] handles)",
  "event PoolRevealed(uint256 indexed marketId, uint256 yesPool, uint256 noPool, uint256 clearingPrice)",
  "event PayoutRequested(uint256 indexed marketId, address indexed bettor, bytes32 handle)",
  "event PayoutClaimed(uint256 indexed marketId, address indexed bettor, uint256 payout)",
  "function createMarket(string question, uint64 epochDuration) external returns (uint256)",
  "function placeBet(uint256 marketId, bytes32 encSide, bytes calldata inputProof) external payable",
  "function resolveMarket(uint256 marketId, uint8 outcome) external",
  "function requestPoolReveal(uint256 marketId) external",
  "function requestPayout(uint256 marketId) external",
  "function getMarket(uint256 marketId) external view returns (address creator, string question, uint64 epochStart, uint64 epochEnd, bool resolved, uint8 outcome, uint256 totalEth, uint256 revealedYesPool, uint256 revealedNoPool, uint256 clearingPrice, bool poolRevealRequested, bool poolRevealed, address priceFeed, int256 strikePrice, bool useOracle)",
  "function getPosition(uint256 marketId, address bettor) external view returns (uint256 amount, bool payoutRequested, bool claimed)",
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitFor(label, check, pollMs = 8000, timeoutMs = 600_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) { log(`✓ ${label}`); return result; }
    log(`  … waiting for ${label}`);
    await wait(pollMs);
  }
  throw new Error(`Timeout waiting for: ${label}`);
}

async function encryptSide(inst, contractAddr, walletAddr, side) {
  const buf = inst.createEncryptedInput(contractAddr, walletAddr);
  buf.add8(side);
  const enc = await buf.encrypt();
  return { handle: enc.handles[0], inputProof: enc.inputProof };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet1  = new ethers.Wallet(PRIVATE_KEY, provider);
  const wallet2  = ethers.Wallet.fromPhrase(MNEMONIC).connect(provider);

  log(`Wallet1 (creator/YES): ${wallet1.address}`);
  log(`Wallet2 (NO bettor):   ${wallet2.address}`);

  const bal1 = await provider.getBalance(wallet1.address);
  const bal2 = await provider.getBalance(wallet2.address);
  log(`Balances: W1=${ethers.formatEther(bal1)} ETH  W2=${ethers.formatEther(bal2)} ETH`);

  // Fund wallet2 if needed
  const MIN_WALLET2 = NO_BET + ethers.parseEther("0.005"); // bet + gas
  if (bal2 < MIN_WALLET2) {
    const topUp = MIN_WALLET2 - bal2 + ethers.parseEther("0.002");
    log(`Funding wallet2 with ${ethers.formatEther(topUp)} ETH…`);
    const fundTx = await wallet1.sendTransaction({ to: wallet2.address, value: topUp });
    await fundTx.wait();
    log(`Wallet2 funded. tx: ${fundTx.hash}`);
  }

  const contract1 = new ethers.Contract(CONTRACT, ABI, wallet1);
  const contract2 = new ethers.Contract(CONTRACT, ABI, wallet2);

  // ── Init FHE instance ──────────────────────────────────────────────────────
  log("Initialising FHE instance…");
  const inst = await createInstance({ ...SepoliaConfig, network: RPC_URL });
  log("FHE ready");

  // ── 1. Create market ───────────────────────────────────────────────────────
  log(`Creating market (${EPOCH_SECONDS}s epoch)…`);
  const createTx = await contract1.createMarket(
    "E2E test: Will this test pass? [YES wins]",
    BigInt(EPOCH_SECONDS)
  );
  const createReceipt = await createTx.wait();
  const iface = new ethers.Interface(ABI);
  const createdLog = createReceipt.logs
    .map(l => { try { return iface.parseLog(l); } catch { return null; } })
    .find(e => e && e.name === "MarketCreated");

  if (!createdLog) throw new Error("MarketCreated event not found");
  const marketId = createdLog.args.marketId;
  const epochEnd = Number(createdLog.args.epochEnd);
  log(`Market #${marketId} created. Epoch ends at ${new Date(epochEnd * 1000).toISOString()}`);

  // ── 2. Wallet1 places YES bet ─────────────────────────────────────────────
  log("Wallet1 encrypting YES side…");
  const { handle: handle1, inputProof: proof1 } = await encryptSide(inst, CONTRACT, wallet1.address, SIDE_YES);
  log("Wallet1 placing YES bet…");
  const bet1Tx = await contract1.placeBet(marketId, handle1, proof1, { value: YES_BET });
  await bet1Tx.wait();
  log(`YES bet placed (${ethers.formatEther(YES_BET)} ETH). tx: ${bet1Tx.hash}`);

  // ── 3. Wallet2 places NO bet ──────────────────────────────────────────────
  log("Wallet2 encrypting NO side…");
  const { handle: handle2, inputProof: proof2 } = await encryptSide(inst, CONTRACT, wallet2.address, SIDE_NO);
  log("Wallet2 placing NO bet…");
  const bet2Tx = await contract2.placeBet(marketId, handle2, proof2, { value: NO_BET });
  await bet2Tx.wait();
  log(`NO bet placed (${ethers.formatEther(NO_BET)} ETH). tx: ${bet2Tx.hash}`);

  // ── 4. Wait for epoch to close ────────────────────────────────────────────
  const secsLeft = epochEnd - Math.floor(Date.now() / 1000);
  if (secsLeft > 0) {
    log(`Epoch closes in ${secsLeft}s — waiting…`);
    await wait((secsLeft + 5) * 1000);
  }

  // ── 5. Resolve: YES wins ───────────────────────────────────────────────────
  log("Resolving market (outcome=YES=1)…");
  const resolveTx = await contract1.resolveMarket(marketId, 1);
  await resolveTx.wait();
  log(`Market resolved. tx: ${resolveTx.hash}`);

  // ── 6. Request pool reveal ─────────────────────────────────────────────────
  log("Requesting pool reveal…");
  const revealReqTx = await contract1.requestPoolReveal(marketId);
  await revealReqTx.wait();
  log(`Pool reveal requested. tx: ${revealReqTx.hash} — keeper should pick this up within ~30s`);

  // Wait for keeper to call onPoolRevealed
  await waitFor("pool revealed", async () => {
    const m = await contract1.getMarket(marketId);
    return m.poolRevealed;
  });

  const market = await contract1.getMarket(marketId);
  log(`Pool revealed — YES: ${market.revealedYesPool} gwei, NO: ${market.revealedNoPool} gwei`);

  // ── 7. Both wallets request payout ────────────────────────────────────────
  log("Wallet1 requesting payout…");
  const payout1Tx = await contract1.requestPayout(marketId);
  await payout1Tx.wait();
  log(`Payout requested by wallet1. tx: ${payout1Tx.hash}`);

  log("Wallet2 requesting payout…");
  const payout2Tx = await contract2.requestPayout(marketId);
  await payout2Tx.wait();
  log(`Payout requested by wallet2. tx: ${payout2Tx.hash}`);

  // Wait for keeper to settle both
  await waitFor("wallet1 payout claimed", async () => {
    const pos = await contract1.getPosition(marketId, wallet1.address);
    return pos.claimed;
  });

  await waitFor("wallet2 payout claimed", async () => {
    const pos = await contract1.getPosition(marketId, wallet2.address);
    return pos.claimed;
  });

  // ── 8. Summary ─────────────────────────────────────────────────────────────
  const pos1 = await contract1.getPosition(marketId, wallet1.address);
  const pos2 = await contract1.getPosition(marketId, wallet2.address);
  const finalBal1 = await provider.getBalance(wallet1.address);
  const finalBal2 = await provider.getBalance(wallet2.address);

  console.log("\n══════════════════════════════════════════════════");
  console.log("  E2E TEST COMPLETE");
  console.log("══════════════════════════════════════════════════");
  console.log(`  Market #${marketId}  |  Outcome: YES wins`);
  console.log(`  Total pool: ${ethers.formatEther(YES_BET + NO_BET)} ETH`);
  console.log(`  W1 (YES) — claimed: ${pos1.claimed}  |  final bal: ${ethers.formatEther(finalBal1)} ETH`);
  console.log(`  W2 (NO)  — claimed: ${pos2.claimed}  |  final bal: ${ethers.formatEther(finalBal2)} ETH`);
  console.log("══════════════════════════════════════════════════\n");
}

main().catch(err => { console.error("[FATAL]", err); process.exit(1); });
