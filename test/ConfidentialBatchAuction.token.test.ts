import { ethers, fhevm } from "hardhat";
import { expect } from "chai";

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

const SIDE_NO   = 0;
const SIDE_YES  = 1;
const ONE_HOUR  = 3600;

// 1 USDC = 1_000_000 raw units (6 decimals)
const ONE_USDC   = 1_000_000n;
const TEN_USDC   = 10_000_000n;
const FIFTY_USDC = 50_000_000n;

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

async function mockPublicDecrypt(handles: string[]) {
  return fhevm.publicDecrypt(handles);
}

/**
 * Encrypt side (uint8) + amount (uint64) in one proof batch for the CBA contract.
 * CBA decodes both in its own context before calling the token contract.
 */
async function encryptTokenBet(
  contractAddress: string,
  signerAddress:   string,
  side:            number,
  amountRaw:       bigint,
) {
  const enc = await fhevm
    .createEncryptedInput(contractAddress, signerAddress)
    .add8(BigInt(side))
    .add64(amountRaw)
    .encrypt();
  return {
    encSide:    enc.handles[0]  as `0x${string}`,
    encAmount:  enc.handles[1]  as `0x${string}`,
    inputProof: enc.inputProof  as `0x${string}`,
  };
}

/** Place an encrypted token bet on behalf of a signer. */
async function placeBetTokenFor(
  signer:     any,
  cba:        any,
  marketId:   bigint,
  side:       number,
  amountRaw:  bigint,
) {
  const addr = await cba.getAddress();
  const { encSide, encAmount, inputProof } = await encryptTokenBet(
    addr, signer.address, side, amountRaw,
  );
  return cba.connect(signer).placeBetToken(marketId, encSide, encAmount, inputProof);
}

/** Request and submit the pool reveal (Pattern 3). */
async function doPoolReveal(cba: any, marketId: bigint) {
  await cba.requestPoolReveal(marketId);
  const [yesHandle, noHandle] = await cba.getEncPools(marketId);
  const proof = await mockPublicDecrypt([yesHandle, noHandle]);
  return cba.onPoolRevealed(
    marketId,
    [yesHandle, noHandle],
    proof.abiEncodedClearValues,
    proof.decryptionProof,
  );
}

/**
 * Call claimToken and return the decrypted payout amount (raw token units).
 * The mock token makes the payout handle publicly decryptable, so we can
 * use fhevm.publicDecrypt to verify the winner/loser amount in tests.
 */
async function doTokenClaim(
  cba:      any,
  mock:     any,
  marketId: bigint,
  bettor:   any,
): Promise<bigint> {
  await cba.connect(bettor).claimToken(marketId);

  // The mock's confidentialTransfer called makePubliclyDecryptable internally.
  const handle = await mock.lastReceivedHandle(bettor.address);
  if (handle === ethers.ZeroHash) return 0n;

  const result = await mockPublicDecrypt([handle]);

  // abiEncodedClearValues is ABI-encoded uint64 (32 bytes, right-padded in 32-byte slot)
  const [payoutRaw] = ethers.AbiCoder.defaultAbiCoder().decode(
    ["uint64"],
    result.abiEncodedClearValues,
  );
  return payoutRaw as bigint;
}

// ──────────────────────────────────────────────────────────────────────────────
// Test suite
// ──────────────────────────────────────────────────────────────────────────────

describe("ConfidentialBatchAuction — cUSDC token path", function () {
  let cba:   any;
  let mock:  any;
  let owner: any, alice: any, bob: any, carol: any;

  before(async function () {
    await fhevm.initializeCLIApi();
  });

  beforeEach(async function () {
    [owner, alice, bob, carol] = await ethers.getSigners();

    // Deploy fresh CBA
    const CBAFactory = await ethers.getContractFactory("ConfidentialBatchAuction");
    cba = await CBAFactory.deploy();
    await cba.waitForDeployment();

    // Deploy mock cUSDC
    const MockFactory = await ethers.getContractFactory("MockConfidentialUSDC");
    mock = await MockFactory.deploy();
    await mock.waitForDeployment();
  });

  // ── Scoped helpers ──────────────────────────────────────────────────────────

  async function createTokenMarket(durationSeconds = ONE_HOUR): Promise<bigint> {
    const tx = await cba.connect(owner).createTokenMarket(
      "Will ETH close above $3000?",
      BigInt(durationSeconds),
    );
    const receipt = await tx.wait();
    const ev = receipt.logs
      .map((l: any) => { try { return cba.interface.parseLog(l); } catch { return null; } })
      .find((e: any) => e && e.name === "TokenMarketCreated");
    return ev ? BigInt(ev.args.marketId) : 0n;
  }

  async function createManualTokenMarket(durationSeconds = ONE_HOUR): Promise<bigint> {
    const cbaAddr  = await cba.getAddress();
    const mockAddr = await mock.getAddress();

    // Temporarily override the CUSDC_TOKEN constant is not possible in Solidity,
    // so we use createTokenMarket which always uses the hardcoded constant.
    // For isolation, we swap the market's token via a fresh deployment where
    // CUSDC_TOKEN matches our mock. Instead, we test the function reverts
    // correctly with the default hardcoded address; full integration
    // tests use placeBetToken directly after force-patching via a test helper.
    //
    // PRACTICAL: in Hardhat, the deployed contract uses CUSDC_TOKEN = real Sepolia address.
    // We cannot override it. So token market tests that actually call placeBetToken
    // must deploy a contract with the mock address patched in. We use a test-only
    // constructor variant via a stub contract.
    //
    // For now: patch by using the ABI directly to call the internal token address.
    // This is tested via CBATokenTestHarness below.
    throw new Error("Use CBATokenTestHarness for mock integration");
  }

  async function timeTravel(seconds: number) {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    await ethers.provider.send("evm_mine", []);
  }

  // ── Deploy a harness that overrides CUSDC_TOKEN with our mock ────────────
  // The production CBA hardcodes CUSDC_TOKEN. For tests, we deploy a subclass
  // that overrides the constant so we can inject the mock token.

  async function deployHarness(): Promise<{ harness: any; mockToken: any }> {
    const MockFactory    = await ethers.getContractFactory("MockConfidentialUSDC");
    const mockToken      = await MockFactory.deploy();
    await mockToken.waitForDeployment();

    const HarnessFactory = await ethers.getContractFactory("CBATokenTestHarness");
    const harness        = await HarnessFactory.deploy(await mockToken.getAddress());
    await harness.waitForDeployment();

    return { harness, mockToken };
  }

  // ── 1. createTokenMarket metadata ─────────────────────────────────────────

  it("createTokenMarket sets isTokenMarket=true and token address", async function () {
    const { harness } = await deployHarness();
    const tx = await harness.connect(owner).createTokenMarket(
      "Will ETH close above $3000?", BigInt(ONE_HOUR),
    );
    const receipt = await tx.wait();
    const ev = receipt.logs
      .map((l: any) => { try { return harness.interface.parseLog(l); } catch { return null; } })
      .find((e: any) => e && e.name === "TokenMarketCreated");
    expect(ev).to.not.be.null;
    const marketId = BigInt(ev.args.marketId);

    const m = await harness.getMarket(marketId);
    expect(m.isTokenMarket).to.be.true;
    expect(m.token.toLowerCase()).to.not.equal("0x0000000000000000000000000000000000000000");
    expect(m.resolved).to.be.false;
    expect(m.totalEth).to.equal(0n);
    expect(m.participantCount).to.equal(0n);
  });

  // ── 2. placeBetToken happy path ────────────────────────────────────────────

  it("placeBetToken stores position, emits TokenBetPlaced, increments participantCount", async function () {
    const { harness, mockToken } = await deployHarness();
    const marketId = await (async () => {
      const tx = await harness.connect(owner).createTokenMarket("Test?", BigInt(ONE_HOUR));
      const r  = await tx.wait();
      const ev = r.logs.map((l: any) => { try { return harness.interface.parseLog(l); } catch { return null; } })
        .find((e: any) => e?.name === "TokenMarketCreated");
      return BigInt(ev.args.marketId);
    })();

    await mock.connect(alice).depositFor === undefined
      ? await mockToken.depositFor(alice.address, TEN_USDC)
      : await mockToken.depositFor(alice.address, TEN_USDC);

    const tx = await placeBetTokenFor(alice, harness, marketId, SIDE_YES, TEN_USDC);
    const receipt = await tx.wait();

    const ev = receipt.logs
      .map((l: any) => { try { return harness.interface.parseLog(l); } catch { return null; } })
      .find((e: any) => e?.name === "TokenBetPlaced");
    expect(ev).to.not.be.null;
    expect(ev.args.bettor).to.equal(alice.address);

    const pos = await harness.getPosition(marketId, alice.address);
    expect(pos.isToken).to.be.true;
    expect(pos.claimed).to.be.false;
    expect(pos.payoutRequested).to.be.false;

    const m = await harness.getMarket(marketId);
    expect(m.participantCount).to.equal(1n);
  });

  // ── 3. placeBetToken — double-bet reverts ──────────────────────────────────

  it("placeBetToken reverts on double-bet (same address)", async function () {
    const { harness, mockToken } = await deployHarness();
    const tx = await harness.connect(owner).createTokenMarket("Test?", BigInt(ONE_HOUR));
    const r  = await tx.wait();
    const ev = r.logs.map((l: any) => { try { return harness.interface.parseLog(l); } catch { return null; } })
      .find((e: any) => e?.name === "TokenMarketCreated");
    const marketId = BigInt(ev.args.marketId);

    await mockToken.depositFor(alice.address, TEN_USDC);
    await placeBetTokenFor(alice, harness, marketId, SIDE_YES, TEN_USDC);

    await expect(
      placeBetTokenFor(alice, harness, marketId, SIDE_NO, TEN_USDC),
    ).to.be.revertedWith("Already bet");
  });

  // ── 4. placeBetToken — epoch closed ───────────────────────────────────────

  it("placeBetToken reverts on closed epoch", async function () {
    const { harness, mockToken } = await deployHarness();
    const tx = await harness.connect(owner).createTokenMarket("Test?", BigInt(60));
    const r  = await tx.wait();
    const marketId = BigInt(r.logs
      .map((l: any) => { try { return harness.interface.parseLog(l); } catch { return null; } })
      .find((e: any) => e?.name === "TokenMarketCreated").args.marketId);

    await ethers.provider.send("evm_increaseTime", [120]);
    await ethers.provider.send("evm_mine", []);

    await mockToken.depositFor(alice.address, TEN_USDC);
    await expect(
      placeBetTokenFor(alice, harness, marketId, SIDE_YES, TEN_USDC),
    ).to.be.revertedWith("Epoch closed");
  });

  // ── 5. placeBetToken — wrong market type reverts ──────────────────────────

  it("placeBetToken reverts on ETH market, placeBet reverts on token market", async function () {
    const { harness, mockToken } = await deployHarness();

    // ETH market
    const ethTx = await harness.connect(owner).createMarket("ETH market?", BigInt(ONE_HOUR));
    const ethR  = await ethTx.wait();
    const ethId = BigInt(ethR.logs
      .map((l: any) => { try { return harness.interface.parseLog(l); } catch { return null; } })
      .find((e: any) => e?.name === "MarketCreated").args.marketId);

    // Token market
    const tokTx = await harness.connect(owner).createTokenMarket("Token market?", BigInt(ONE_HOUR));
    const tokR  = await tokTx.wait();
    const tokId = BigInt(tokR.logs
      .map((l: any) => { try { return harness.interface.parseLog(l); } catch { return null; } })
      .find((e: any) => e?.name === "TokenMarketCreated").args.marketId);

    await mockToken.depositFor(alice.address, TEN_USDC);

    // Token bet on ETH market → revert
    await expect(
      placeBetTokenFor(alice, harness, ethId, SIDE_YES, TEN_USDC),
    ).to.be.revertedWith("ETH market: use placeBet");

    // ETH bet on token market → revert
    const enc = await fhevm
      .createEncryptedInput(await harness.getAddress(), alice.address)
      .add8(BigInt(SIDE_YES))
      .encrypt();
    await expect(
      harness.connect(alice).placeBet(tokId, enc.handles[0], enc.inputProof, {
        value: ethers.parseEther("0.01"),
      }),
    ).to.be.revertedWith("Token market: use placeBetToken");
  });

  // ── 6. Pool reveal uses raw token units (no gwei multiplication) ──────────

  it("pool reveal stores raw USDC units, not gwei-converted", async function () {
    const { harness, mockToken } = await deployHarness();
    const tx = await harness.connect(owner).createTokenMarket("Test?", BigInt(60));
    const r  = await tx.wait();
    const marketId = BigInt(r.logs
      .map((l: any) => { try { return harness.interface.parseLog(l); } catch { return null; } })
      .find((e: any) => e?.name === "TokenMarketCreated").args.marketId);

    // alice: 10 USDC YES, bob: 10 USDC NO
    await mockToken.depositFor(alice.address, TEN_USDC);
    await mockToken.depositFor(bob.address, TEN_USDC);
    await placeBetTokenFor(alice, harness, marketId, SIDE_YES, TEN_USDC);
    await placeBetTokenFor(bob,   harness, marketId, SIDE_NO,  TEN_USDC);

    await ethers.provider.send("evm_increaseTime", [120]);
    await ethers.provider.send("evm_mine", []);
    await harness.connect(owner).resolveMarket(marketId, SIDE_YES);
    await doPoolReveal(harness, marketId);

    const m = await harness.getMarket(marketId);
    // Raw units — if it were ETH path these would be * 1e9; they should NOT be here
    // TEN_USDC = 10_000_000 (1e7). ETH-path would give 10_000_000 * 1e9 = 1e16 (insane)
    expect(m.revealedYesPool).to.equal(TEN_USDC);
    expect(m.revealedNoPool).to.equal(TEN_USDC);
    // Clearing price: 50% YES → 5000 bp
    expect(Number(m.clearingPrice)).to.equal(5000);
  });

  // ── 7. claimToken — winner receives correct payout ─────────────────────────

  it("claimToken: winner receives proportional payout", async function () {
    const { harness, mockToken } = await deployHarness();
    const tx = await harness.connect(owner).createTokenMarket("Test?", BigInt(60));
    const r  = await tx.wait();
    const marketId = BigInt(r.logs
      .map((l: any) => { try { return harness.interface.parseLog(l); } catch { return null; } })
      .find((e: any) => e?.name === "TokenMarketCreated").args.marketId);

    // alice: 10 USDC YES, bob: 10 USDC NO
    // outcome YES → alice wins all 20 USDC
    await mockToken.depositFor(alice.address, TEN_USDC);
    await mockToken.depositFor(bob.address, TEN_USDC);
    await placeBetTokenFor(alice, harness, marketId, SIDE_YES, TEN_USDC);
    await placeBetTokenFor(bob,   harness, marketId, SIDE_NO,  TEN_USDC);

    await ethers.provider.send("evm_increaseTime", [120]);
    await ethers.provider.send("evm_mine", []);
    await harness.connect(owner).resolveMarket(marketId, SIDE_YES);
    await doPoolReveal(harness, marketId);

    // Alice claims — should receive 20 USDC (all of YES + NO pool)
    const alicePayout = await doTokenClaim(harness, mockToken, marketId, alice);
    expect(alicePayout).to.equal(TEN_USDC * 2n); // 10 * (20/10) = 20 USDC

    // Alice's position is marked claimed
    const pos = await harness.getPosition(marketId, alice.address);
    expect(pos.claimed).to.be.true;
  });

  // ── 8. claimToken — loser receives 0 payout, no revert ────────────────────

  it("claimToken: loser receives 0 payout without side being revealed", async function () {
    const { harness, mockToken } = await deployHarness();
    const tx = await harness.connect(owner).createTokenMarket("Test?", BigInt(60));
    const r  = await tx.wait();
    const marketId = BigInt(r.logs
      .map((l: any) => { try { return harness.interface.parseLog(l); } catch { return null; } })
      .find((e: any) => e?.name === "TokenMarketCreated").args.marketId);

    await mockToken.depositFor(alice.address, TEN_USDC);
    await mockToken.depositFor(bob.address, TEN_USDC);
    await placeBetTokenFor(alice, harness, marketId, SIDE_YES, TEN_USDC);
    await placeBetTokenFor(bob,   harness, marketId, SIDE_NO,  TEN_USDC);

    await ethers.provider.send("evm_increaseTime", [120]);
    await ethers.provider.send("evm_mine", []);
    await harness.connect(owner).resolveMarket(marketId, SIDE_YES);
    await doPoolReveal(harness, marketId);

    // Bob (NO) loses — payout = 0
    const bobPayout = await doTokenClaim(harness, mockToken, marketId, bob);
    expect(bobPayout).to.equal(0n);

    // Bob's position marked claimed regardless
    const pos = await harness.getPosition(marketId, bob.address);
    expect(pos.claimed).to.be.true;
  });

  // ── 9. claimToken — pool not revealed reverts ─────────────────────────────

  it("claimToken reverts if pool not revealed", async function () {
    const { harness, mockToken } = await deployHarness();
    const tx = await harness.connect(owner).createTokenMarket("Test?", BigInt(60));
    const r  = await tx.wait();
    const marketId = BigInt(r.logs
      .map((l: any) => { try { return harness.interface.parseLog(l); } catch { return null; } })
      .find((e: any) => e?.name === "TokenMarketCreated").args.marketId);

    await mockToken.depositFor(alice.address, TEN_USDC);
    await placeBetTokenFor(alice, harness, marketId, SIDE_YES, TEN_USDC);
    await ethers.provider.send("evm_increaseTime", [120]);
    await ethers.provider.send("evm_mine", []);
    await harness.connect(owner).resolveMarket(marketId, SIDE_YES);
    // Pool NOT revealed

    await expect(
      harness.connect(alice).claimToken(marketId),
    ).to.be.revertedWith("Pool not revealed");
  });

  // ── 10. claimToken — no position reverts ──────────────────────────────────

  it("claimToken reverts if no token position", async function () {
    const { harness, mockToken } = await deployHarness();
    const tx = await harness.connect(owner).createTokenMarket("Test?", BigInt(60));
    const r  = await tx.wait();
    const marketId = BigInt(r.logs
      .map((l: any) => { try { return harness.interface.parseLog(l); } catch { return null; } })
      .find((e: any) => e?.name === "TokenMarketCreated").args.marketId);

    await mockToken.depositFor(alice.address, TEN_USDC);
    await placeBetTokenFor(alice, harness, marketId, SIDE_YES, TEN_USDC);
    await ethers.provider.send("evm_increaseTime", [120]);
    await ethers.provider.send("evm_mine", []);
    await harness.connect(owner).resolveMarket(marketId, SIDE_YES);
    await doPoolReveal(harness, marketId);

    // Bob never bet
    await expect(
      harness.connect(bob).claimToken(marketId),
    ).to.be.revertedWith("No token position");
  });

  // ── 11. claimToken — double-claim reverts ────────────────────────────────

  it("claimToken reverts on double-claim", async function () {
    const { harness, mockToken } = await deployHarness();
    const tx = await harness.connect(owner).createTokenMarket("Test?", BigInt(60));
    const r  = await tx.wait();
    const marketId = BigInt(r.logs
      .map((l: any) => { try { return harness.interface.parseLog(l); } catch { return null; } })
      .find((e: any) => e?.name === "TokenMarketCreated").args.marketId);

    await mockToken.depositFor(alice.address, TEN_USDC);
    await placeBetTokenFor(alice, harness, marketId, SIDE_YES, TEN_USDC);
    await ethers.provider.send("evm_increaseTime", [120]);
    await ethers.provider.send("evm_mine", []);
    await harness.connect(owner).resolveMarket(marketId, SIDE_YES);
    await doPoolReveal(harness, marketId);

    await harness.connect(alice).claimToken(marketId);
    await expect(
      harness.connect(alice).claimToken(marketId),
    ).to.be.revertedWith("Already claimed");
  });

  // ── 12. Full token happy path ─────────────────────────────────────────────

  it("Full token happy path: 3 bettors → resolve → pool reveal → correct payouts", async function () {
    // alice: 10 USDC YES, bob: 10 USDC NO, carol: 10 USDC YES
    // outcome YES → alice and carol each win; bob loses
    // totalPool = 30, winPool = 20
    // alice payout = 10 * 30 / 20 = 15 USDC
    // carol payout = 10 * 30 / 20 = 15 USDC
    // bob   payout = 0

    const { harness, mockToken } = await deployHarness();
    const tx = await harness.connect(owner).createTokenMarket("Will ETH > $3000?", BigInt(60));
    const r  = await tx.wait();
    const marketId = BigInt(r.logs
      .map((l: any) => { try { return harness.interface.parseLog(l); } catch { return null; } })
      .find((e: any) => e?.name === "TokenMarketCreated").args.marketId);

    // Setup
    await mockToken.depositFor(alice.address, TEN_USDC);
    await mockToken.depositFor(bob.address,   TEN_USDC);
    await mockToken.depositFor(carol.address, TEN_USDC);

    await placeBetTokenFor(alice, harness, marketId, SIDE_YES, TEN_USDC);
    await placeBetTokenFor(bob,   harness, marketId, SIDE_NO,  TEN_USDC);
    await placeBetTokenFor(carol, harness, marketId, SIDE_YES, TEN_USDC);

    expect((await harness.getMarket(marketId)).participantCount).to.equal(3n);

    await ethers.provider.send("evm_increaseTime", [120]);
    await ethers.provider.send("evm_mine", []);
    await harness.connect(owner).resolveMarket(marketId, SIDE_YES);
    await doPoolReveal(harness, marketId);

    const m = await harness.getMarket(marketId);
    expect(m.poolRevealed).to.be.true;
    expect(m.revealedYesPool).to.equal(TEN_USDC * 2n);  // 20 USDC
    expect(m.revealedNoPool).to.equal(TEN_USDC);          // 10 USDC
    // Clearing price: 20/30 * 10000 = 6666
    expect(Number(m.clearingPrice)).to.equal(6666);

    // Alice wins 15 USDC
    const alicePayout = await doTokenClaim(harness, mockToken, marketId, alice);
    expect(alicePayout).to.equal(15_000_000n); // 15 USDC

    // Carol wins 15 USDC
    const carolPayout = await doTokenClaim(harness, mockToken, marketId, carol);
    expect(carolPayout).to.equal(15_000_000n);

    // Bob loses, gets 0
    const bobPayout = await doTokenClaim(harness, mockToken, marketId, bob);
    expect(bobPayout).to.equal(0n);

    // All positions claimed
    expect((await harness.getPosition(marketId, alice.address)).claimed).to.be.true;
    expect((await harness.getPosition(marketId, carol.address)).claimed).to.be.true;
    expect((await harness.getPosition(marketId, bob.address)).claimed).to.be.true;

    // TokenPayoutClaimed events emitted for all three
    // (no payout amount in event — intentionally private)
  });
});
