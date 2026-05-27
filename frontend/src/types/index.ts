export type EpochStatus =
  | "accumulating"
  | "closed"
  | "resolving"
  | "revealing"
  | "revealed";

export interface MarketView {
  id: number;
  creator: string;
  question: string;
  epochStart: number;
  epochEnd: number;
  resolved: boolean;
  outcome: number;
  totalEth: bigint;
  clearingPrice: bigint;
  revealedYesPool: bigint;
  revealedNoPool: bigint;
  poolRevealRequested: boolean;
  poolRevealed: boolean;
  epochStatus: EpochStatus;
  // Oracle resolution
  priceFeed: string;
  strikePrice: bigint;
  useOracle: boolean;
}

export interface PositionView {
  amount: bigint;
  payoutRequested: boolean;
  claimed: boolean;
}

export const SIDE_NO  = 0;
export const SIDE_YES = 1;
export const UNRESOLVED = 255;

export function computeEpochStatus(m: MarketView): EpochStatus {
  const now = Math.floor(Date.now() / 1000);
  if (m.poolRevealed) return "revealed";
  if (m.poolRevealRequested) return "revealing";
  if (m.resolved) return "resolving";
  if (now >= m.epochEnd) return "closed";
  return "accumulating";
}

// Known Chainlink price feeds on Sepolia
export const SEPOLIA_FEEDS: { label: string; address: string; decimals: number; unit: string }[] = [
  { label: "ETH / USD",  address: "0x694AA1769357215DE4FAC081bf1f309aDC325306", decimals: 8, unit: "USD" },
  { label: "BTC / USD",  address: "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43", decimals: 8, unit: "USD" },
  { label: "LINK / USD", address: "0xc59E3633BAAC79493d908e63626716e204A45EdF", decimals: 8, unit: "USD" },
  { label: "EUR / USD",  address: "0x1a81afB8146aeFfCFc5E50e8479e826E7D55b910", decimals: 8, unit: "USD" },
];

/** Convert a human-readable price (e.g. 3000) to feed native units (8 decimals) */
export function toFeedUnits(price: number, decimals: number): bigint {
  return BigInt(Math.round(price * 10 ** decimals));
}

/** Convert feed native units back to a human-readable price string */
export function fromFeedUnits(raw: bigint, decimals: number): string {
  const n = Number(raw) / 10 ** decimals;
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
