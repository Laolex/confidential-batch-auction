# Pri-Markets — Technical Highlights

One page for judges/reviewers. Everything below is live on Sepolia
([`0xF00573Fb…0d41C1`](https://sepolia.etherscan.io/address/0xF00573FbBE32264ac14442BDC39512845D0d41C1))
and wired into https://pri-markets.vercel.app.

---

## 1 · Side *and* amount encrypted end-to-end — one input proof

Most "confidential" markets hide only the amount, or only hide direction until reveal. Pri-Markets
seals **both** in a single input proof; the chain only ever sees ciphertext handles.

```ts
// frontend/src/lib/fhe/encrypt.ts
const buf = fhevmInst.createEncryptedInput(contractAddress, userAddress);
buf.add8(BigInt(side));   // 0 = NO, 1 = YES   (encrypted)
buf.add64(amountRaw);     // cUSDC amount      (encrypted)
const enc = await buf.encrypt();
// enc.handles[0] = side, enc.handles[1] = amount, enc.inputProof (shared)
```

**Why it matters:** there is no plaintext `side` anywhere — not in storage, not in events, not even
after settlement. The reflexivity/front-running problem is solved *at the microstructure level*, not
patched after the fact.

---

## 2 · Settlement computed on ciphertext, in the coprocessor

Payout is derived from encrypted stakes and moved with `confidentialTransfer` — the amount is never
plaintext, and only the claimer can decrypt their own number.

```solidity
// contracts/ConfidentialBatchAuction.sol — side is never read
euint64 winStake = m.outcome == SIDE_YES ? pos.yesStake : pos.noStake; // 0 for losing-only bettors
euint64 encPayout = FHE.div(FHE.mul(winStake, uint64(m.distributable)), uint64(winPool));
FHE.allow(encPayout, msg.sender);                 // ACL: only the claimer decrypts
IConfidentialUSDC(m.token).confidentialTransfer(msg.sender, encPayout);
```

---

## 3 · FHE fixed-point overflow guard (the detail nobody else handles)

`euint64` multiplication wraps silently mod 2⁶⁴. A naive `winStake · distributable` overflows on large
pools and pays out garbage. Pri-Markets guards it: the exact product is used only while it provably
fits in 64 bits; larger pools route through a **Q13 fixed-point ratio** with a bounded, tiny precision
cost.

```solidity
if (winPool == 0) {
    encPayout = FHE.asEuint64(0);                                   // no winners → 0, pot swept to treasury
} else if (m.distributable <= type(uint64).max / winPool) {
    encPayout = FHE.div(FHE.mul(winStake, uint64(m.distributable)), uint64(winPool)); // exact path
} else {
    require(m.distributable <= type(uint64).max >> 13, "Pool overflow");
    uint256 ratioQ13 = (m.distributable << 13) / winPool;          // Q13 fixed-point ratio
    encPayout = FHE.shr(FHE.mul(winStake, uint64(ratioQ13)), 13);  // precision loss < winStake/8192 (≤ 0.013%)
}
```

**Why it matters:** correct FHE arithmetic under a 64-bit ceiling is a real, easy-to-miss trap. This
is production-grade care, not a happy-path demo.

---

## 4 · Two cost budgets — and we measure the invisible one (HCU)

A confidential contract has **EVM gas** (every explorer shows it) *and* **HCU** — the off-chain
coprocessor compute budget, capped per-tx, that **no block explorer or `hardhat-gas-reporter`
measures**. Blow the HCU cap and the tx mines but decryption silently fails.

| Function | txHCU | % of ~20M per-tx cap | Confidence |
|---|--:|--:|:--|
| `claim` | 1,080,032 | ~5% | LOW* |
| `placeBet` | 813,130 | ~4% | LOW* |
| `_initMarket` | 64 | — | HIGH |

\* LOW because `claim`/`placeBet` call external ERC-7984 `confidentialTransfer[From]`, whose FHE ops
bill the **same per-tx HCU budget** but live outside this contract — so `txHCU` is an explicit *lower
bound*, not a silent under-count.

Profiled with **[fhe-gas-profiler](https://github.com/fhe-profiler/fhe-gas-profiler)** (our own tool, on npm)
— which the repo dogfoods as a published dependency and a **CI HCU-regression gate**.

---

## 5 · It's a live system, not a scripted demo

- **Permissionless resolution** — `resolveByOracle` (anyone, Chainlink-backed price feeds) or creator
  resolution for non-oracle markets.
- **Autonomous keeper** — polls every 30 s, auto-resolves closed epochs and auto-reveals pools (KMS
  public-decrypt → `onPoolRevealed`). Resumable on-disk state back-filled from the deploy block, RPC
  fallback, retry-with-backoff. Ships as a `systemd` unit. In-app buttons are manual fallbacks only.
- **Protocol fee + treasury** — 2% (200 bps, owner-adjustable, hard-capped at 10%) skimmed at reveal;
  fee *and* any no-winner pot swept via permissionless idempotent `sweepFees()`.

---

## 6 · FHE frontend integration (the hard, unglamorous part)

- **Edge relayer proxy** (`frontend/api/zama-relay.js`) — forwards the SDK to
  `relayer.testnet.zama.org/v2`, normalizes paths to the `/v2` protocol, preserves binary payloads +
  CORS, so the browser never talks to the relayer cross-origin.
- **Cross-origin isolation** (`frontend/vercel.json`) — COOP `same-origin` + COEP `require-corp` + a
  tuned CSP so the FHE WASM worker gets `SharedArrayBuffer`.
- **Private payout reveal** — winners decrypt their *own* payout client-side via relayer `userDecrypt`
  under an EIP-712 grant.
- **Robustness** — FHE init is timeout-guarded with one-click retry; WalletConnect is opt-in and
  32-hex-validated (a bad id would half-init a connector and throw on first write); heavy Zama SDK is
  dynamically imported (bundle ~1.9 MB → ~1 MB).

---

## Confidentiality model (what leaks, what never does)

| Layer | During epoch | After close |
|---|---|---|
| Directional choice | Encrypted | **Never revealed** |
| Bet amount | Encrypted | **Never revealed** |
| YES / NO split | Encrypted | Public (aggregate only) |
| Clearing price | Hidden | Single reveal |
| Individual payout | Encrypted | Recipient-only decrypt |

## Stack
Solidity 0.8.24 · `@fhevm/solidity` 0.11.1 · Hardhat + `@fhevm/hardhat-plugin` · cUSDC (ERC-7984) ·
React 18 + Vite + TS · wagmi v2 / viem · RainbowKit · `@zama-fhe/relayer-sdk` · Vercel Edge · Node keeper (systemd)
