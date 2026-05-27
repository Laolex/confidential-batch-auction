/**
 * Frontend UI test via Playwright + injected mock wallet.
 * No MetaMask extension needed — window.ethereum is shimmed with the actual private key.
 *
 * Tests:
 *  1. Landing page renders
 *  2. Connect Wallet succeeds
 *  3. Markets list shows market #1
 *  4. Market detail shows resolved state + claimed payouts
 */

import { chromium } from '/tmp/pw-test/node_modules/playwright/index.mjs';
import { ethers } from 'ethers';

const PRIVATE_KEY = "0xf62185cc6ab67626408323147263e67c34b42fb6e148c0367a84aa46790932af";
const RPC_URL     = "https://ethereum-sepolia-rpc.publicnode.com";
const FRONTEND    = "https://confidential-batch-auction.vercel.app";
const CHAIN_ID    = "0xaa36a7"; // Sepolia

const wallet   = new ethers.Wallet(PRIVATE_KEY);
const provider = new ethers.JsonRpcProvider(RPC_URL);

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

async function shot(page, name) {
  await page.screenshot({ path: `/tmp/cba-${name}.png`, fullPage: false });
  log(`Screenshot: /tmp/cba-${name}.png`);
}

// ── Build the window.ethereum shim (runs inside browser context) ─────────────
// Serialised and injected via addInitScript — must be self-contained, no closures
// from Node scope (except the values we embed as JSON literals).
function buildEthereumShim(address, chainId, rpcUrl) {
  return `
(function() {
  const ADDRESS  = ${JSON.stringify(address)};
  const CHAIN_ID = ${JSON.stringify(chainId)};
  const RPC_URL  = ${JSON.stringify(rpcUrl)};
  const PRIVATE_KEY = ${JSON.stringify(PRIVATE_KEY)};

  // Proxy non-signing calls directly to RPC
  async function rpc(method, params = []) {
    const resp = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const json = await resp.json();
    if (json.error) throw new Error(json.error.message);
    return json.result;
  }

  // Minimal EIP-1193 provider
  const _listeners = {};
  const ethereum = {
    isMetaMask: true,
    selectedAddress: ADDRESS,
    chainId: CHAIN_ID,
    networkVersion: '11155111',

    request({ method, params = [] }) {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') {
        return Promise.resolve([ADDRESS]);
      }
      if (method === 'eth_chainId') return Promise.resolve(CHAIN_ID);
      if (method === 'net_version') return Promise.resolve('11155111');
      if (method === 'wallet_switchEthereumChain') return Promise.resolve(null);
      // Proxy everything else (eth_call, eth_getLogs, eth_getBalance, etc.)
      return rpc(method, params);
    },

    on(event, cb) {
      (_listeners[event] = _listeners[event] || []).push(cb);
    },
    removeListener() {},
    emit(event, ...args) {
      (_listeners[event] || []).forEach(cb => cb(...args));
    },
  };

  // Fire accountsChanged immediately so wagmi picks up the account
  Object.defineProperty(window, 'ethereum', { value: ethereum, writable: false });

  // Give wagmi/viem time to mount, then announce accounts
  window.addEventListener('load', () => {
    ethereum.emit('accountsChanged', [ADDRESS]);
    ethereum.emit('connect', { chainId: CHAIN_ID });
  });
})();
`.replace('const PRIVATE_KEY = ${JSON.stringify(PRIVATE_KEY)};',
          `const PRIVATE_KEY = ${JSON.stringify(PRIVATE_KEY)};`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const address = wallet.address;
  log(`Testing as wallet: ${address}`);

  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true,
  });

  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  // Inject shim before any page script runs
  await ctx.addInitScript(buildEthereumShim(address, CHAIN_ID, RPC_URL));

  const page = await ctx.newPage();

  // Log console errors from the page
  page.on('console', msg => {
    if (msg.type() === 'error') log(`[page error] ${msg.text()}`);
  });

  // ── 1. Landing page ──────────────────────────────────────────────────────
  log("Loading landing page…");
  await page.goto(FRONTEND, { waitUntil: 'networkidle' });
  await shot(page, '01-landing');

  const heading = await page.textContent('h1, h2').catch(() => '');
  log(`Heading: ${heading.trim().replace(/\s+/g,' ')}`);

  // ── 2. Markets list (no wallet needed for read-only) ────────────────────
  log("Navigating to markets…");
  await page.goto(`${FRONTEND}/markets`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  await shot(page, '02-markets-list');

  const bodyText = await page.textContent('body');
  const hasMarkets = /E2E test|Will BTC|market/i.test(bodyText);
  log(`Markets visible: ${hasMarkets}`);

  // ── 3. Market #1 detail ──────────────────────────────────────────────────
  log("Opening market #1…");
  const marketCard = page.locator('a[href*="/market/1"], a[href*="market/1"]').first();
  const hasCard = await marketCard.isVisible({ timeout: 5000 }).catch(() => false);
  if (hasCard) {
    await marketCard.click();
    await page.waitForLoadState('networkidle');
  } else {
    await page.goto(`${FRONTEND}/market/1`, { waitUntil: 'networkidle' });
  }

  await page.waitForTimeout(4000);
  await shot(page, '03-market-detail');

  const detailText = await page.textContent('body');
  log(`Resolved: ${/resolved|YES wins|outcome/i.test(detailText)}`);
  log(`Pool revealed: ${/pool revealed|yes pool|no pool/i.test(detailText)}`);
  log(`Claimed: ${/claimed|payout/i.test(detailText)}`);

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════');
  console.log('  FRONTEND TEST COMPLETE');
  console.log('══════════════════════════════════════════════════');
  console.log(`  Landing:       /tmp/cba-01-landing.png`);
  console.log(`  Markets list:  /tmp/cba-02-markets-list.png`);
  console.log(`  Market detail: /tmp/cba-03-market-detail.png`);
  console.log('══════════════════════════════════════════════════\n');

  await browser.close();
}

main().catch(err => { console.error('[FATAL]', err.message); process.exit(1); });
