# Pri-Markets — Demo Video Script

**Runtime target:** ~3:20 · **Format:** screen recording + voiceover · **Deep-dive:** [`TECHNICAL_HIGHLIGHTS.md`](./TECHNICAL_HIGHLIGHTS.md)
**Live app:** https://pri-markets.vercel.app · **Contract:** [`0xF00573Fb…0d41C1`](https://sepolia.etherscan.io/address/0xF00573FbBE32264ac14442BDC39512845D0d41C1) (Sepolia)

**Before you record**
- Fund a Sepolia wallet with a little ETH (Google / PoW faucet — linked in-app).
- Have the keeper running (or note that resolve/reveal is permissionless and the keeper does it in ~30 s).
- Optionally run `npx hardhat run scripts/seed-demo.ts --network sepolia` so at least one epoch is mid-accumulation for the whole recording.
- Pre-mint some test USDC once so you're not waiting on the faucet mid-take.

---

## 0:00 — 0:20 · The problem (hero screen)

> **[On screen: the Pri-Markets home page — "SEALED CAPITAL." hero]**
>
> "Every prediction market has the same leak. The moment you place a bet, your direction is public. Odds move, other traders copy the flow, and you get reflexive momentum and front-running instead of honest price discovery.
>
> Pri-Markets fixes the microstructure. It's a sealed-bid prediction market built on Zama's fhEVM — your **side and your amount are both encrypted end-to-end**, and the market reveals only **one aggregate clearing price** at epoch close."

*Action: slow-scroll the three pillars — SEALED ACCUMULATION → AGGREGATE REVEAL → FHE SETTLEMENT.*

---

## 0:20 — 0:35 · How it works (pipeline explainer)

> **[On screen: full-screen pipeline flow-gram — `demo/cards/card-01-pipeline.png`. Optionally reveal the six stages left-to-right as you name them.]**
>
> "Here's the whole flow in one picture. You **encrypt** your side and amount in the browser, **place a sealed bid**, and bids **accumulate** while the epoch is open. When it closes, a permissionless keeper **resolves** the outcome and **reveals** only the aggregate. Then you **claim** — a payout computed on ciphertext that only you can decrypt.
>
> The two bars at the bottom are the whole point: your side, your amount, and your individual payout stay encrypted end-to-end. All the market ever exposes is the YES/NO aggregate and one clearing price."

*Action: hold on the diagram ~4 s after narrating, then cut to the live app. (This is the mental model — everything after this is that same flow, live.)*

---

## 0:35 — 0:55 · Connect & fund

> **[On screen: click "Connect Wallet", pick MetaMask, confirm Sepolia]**
>
> "Connect a Sepolia wallet. Collateral is **cUSDC** — a fully confidential ERC-7984 token — so I'll grab some test USDC from the in-app faucet first."

*Action: click the faucet, confirm the mint tx, show the balance update.*

---

## 0:55 — 1:35 · Place a sealed bid (the core moment)

> **[On screen: open a live market from the MARKETS list — e.g. "ETH > $4,000 by close"]**
>
> "Here's a live epoch. Notice what's public: the number of bids and the number of bettors. What's **not** public: which way anyone bet, or how much. There is no order book and no moving odds to react to.
>
> I'll pick a side — YES — and an amount. Watch what the client does."

*Action: select YES, enter an amount, click Place Bid. Narrate the mining steps as the tx buttons advance:*

> "The amount and the side get encrypted **in one input proof** — `add8(side).add64(amount)` — before anything leaves the browser. Then it runs the flow: approve, wrap USDC into confidential cUSDC, authorize the contract as operator, and finally `placeBet`. The chain only ever sees ciphertext handles."

*Action: after confirmation, show the bid count tick up by one while the YES/NO split stays hidden.*

> "Bid confirmed. The counter went up — but the pool split is still sealed. Nothing on-chain, and nothing in the events, reveals which direction I took."

*(Optional 10 s: place a second bet on the other side to show top-ups / hedging — per-position encrypted sub-pools accumulate.)*

---

## 2:00 — 2:35 · Epoch close, resolve & aggregate reveal

> **[On screen: an epoch that has just closed / the Dashboard]**
>
> "When the epoch closes, two permissionless steps run — and our keeper does them automatically within about thirty seconds. First, `resolveByOracle` settles the outcome against a Chainlink price feed. Then `requestPoolReveal` decrypts the pools through Zama's KMS."

*Action: show the revealed state — YES vs NO aggregate volumes and the single clearing price.*

> "Now — and only now — you see the aggregate: the YES and NO totals and **one clearing price**, in cUSDC. That's the entire information release. Individual bets were never decrypted; the settlement math reads the winning encrypted sub-pool directly. A 2% protocol fee is skimmed to the treasury, and winners split the rest."

---

## 1:35 — 2:00 · Technical highlights (on-screen code inserts)

> **[Editing note: this beat overlays the ~30 s keeper wait between epoch-close and reveal — otherwise dead time. Cut away from the browser to three full-screen code cards (`demo/cards/card-a`, `card-b`, `card-c`) while you narrate, then cut back to the revealed pools. Cards A/B ~8 s each, C ~8 s (flash to ~4 s if tight). Pre-rendered PNGs in `demo/cards/`.]**
>
> "Two things make this real rather than a mock.
>
> **First — one input proof seals both side and amount before anything leaves the browser:**"

*Insert card A (hold ~8 s):*
```ts
const buf = fhevmInst.createEncryptedInput(contractAddress, userAddress);
buf.add8(BigInt(side));   // 0 = NO, 1 = YES   (encrypted)
buf.add64(amountRaw);     // cUSDC amount      (encrypted)
const enc = await buf.encrypt();
```

> "**Second — the payout is computed on ciphertext, inside the coprocessor, and only the claimer can decrypt it:**"

*Insert card B (hold ~8 s):*
```solidity
euint64 winStake = m.outcome == SIDE_YES ? pos.yesStake : pos.noStake;
euint64 encPayout = FHE.div(FHE.mul(winStake, uint64(m.distributable)), uint64(winPool));
FHE.allow(encPayout, msg.sender);                 // ACL: only the claimer decrypts
IConfidentialUSDC(m.token).confidentialTransfer(msg.sender, encPayout);
```

> "**Third — the detail nobody handles.** `euint64` multiplication wraps silently at 2⁶⁴, so a naive payout overflows on large pools. We guard it — the exact product only when it provably fits, otherwise a Q13 fixed-point ratio:**"

*Insert card C (hold ~8 s):*
```solidity
if (winPool == 0) encPayout = FHE.asEuint64(0);
else if (distributable <= MAX / winPool)
    encPayout = FHE.div(FHE.mul(winStake, distributable), winPool);   // exact path
else {                                     // Q13 fixed-point path, < 0.013% precision cost
    uint256 ratioQ13 = (distributable << 13) / winPool;
    encPayout = FHE.shr(FHE.mul(winStake, ratioQ13), 13);
}
```

> "Correct FHE math under a 64-bit ceiling. And there's a second cost budget nobody usually measures: **HCU**, the coprocessor's per-tx compute cap. A bet is 813k HCU — about 4% of the cap — profiled by a tool I built and wired into CI."

*(Keep this beat tight — it's the "this person actually understands fhEVM" moment. If you're over time, card C can drop to a ~4 s flash. Full detail lives in `TECHNICAL_HIGHLIGHTS.md` for anyone who digs in.)*

---

## 2:35 — 2:55 · Private payout (claim)

> **[On screen: as a winner, click Claim]**
>
> "Settlement happens in a single transaction, computed inside the coprocessor — `payout = your winning stake × the after-fee pool ÷ the winning pool`. The result is transferred with `confidentialTransfer`, so even the payout amount stays encrypted on-chain.
>
> To *see* my own number, I sign an EIP-712 grant and the relayer does a client-side `userDecrypt` — only I can read it."

*Action: sign, show the revealed personal payout figure.*

> "There's my payout — decrypted just for me. My direction and amount stay encrypted forever. There's no retroactive way to infer who bet which way."

---

## 2:55 — 3:10 · Close

> **[On screen: back to the home page / confidentiality-model table]**
>
> "That's Pri-Markets: sealed accumulation, one aggregate reveal, confidential settlement — a market-microstructure primitive on fhEVM that makes front-running and directional leakage structurally impossible. Live on Sepolia now. Links below."

---

## One-liner (for submission blurb)
> Pri-Markets is a sealed-bid prediction market on Zama fhEVM: both side **and** amount stay encrypted through settlement, the market reveals a single aggregate clearing price at epoch close, and a permissionless keeper auto-resolves and reveals — killing front-running and reflexive momentum at the microstructure level.

## Shot list / B-roll (if editing)
0. Title slide — PRI · "Sealed-bid prediction markets on Zama fhEVM" (cold open, ~3 s) · `cards/card-00-title.png`
1. Hero "SEALED CAPITAL." (0:00)
1b. Pipeline flow-gram — 6-stage lifecycle + encrypted/public lanes (0:20) · `cards/card-01-pipeline.png`
2. Connect wallet modal + faucet mint (0:35)
3. Market card: bid/bettor counts visible, split hidden (0:45)
4. Bid tx step-through: approve → wrap → authorize → placeBet (1:00)
5. Bid counter increments, split still sealed (1:25)
6. Code card A — `add8(side).add64(amount)` encrypt (1:35) · `cards/card-a-encrypted-input.png`
7. Code card B — on-ciphertext payout + `confidentialTransfer` (1:43) · `cards/card-b-ciphertext-settlement.png`
8. Code card C — Q13 fixed-point overflow guard (1:51) · `cards/card-c-q13-overflow-guard.png`
9. Dashboard: revealed YES/NO split + clearing price (2:15)
10. Claim → EIP-712 sign → personal payout revealed (2:35)
11. Confidentiality-model table (3:00)
12. Closing slide — "Front-running, structurally impossible." + links (end card, ~4 s) · `cards/card-99-close.png`
