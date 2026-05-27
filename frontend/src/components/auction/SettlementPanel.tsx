import { motion } from "framer-motion";
import { formatEther } from "viem";
import type { MarketView } from "@/types";
import { SIDE_YES, UNRESOLVED } from "@/types";

function fmtEth(wei: bigint) {
  return Number(formatEther(wei)).toFixed(4);
}

export function SettlementPanel({ market }: { market: MarketView }) {
  if (!market.poolRevealed) return null;

  const total = market.revealedYesPool + market.revealedNoPool;
  const yesPct = total > 0n ? Number((market.revealedYesPool * 10000n) / total) / 100 : 0;
  const noPct = 100 - yesPct;
  const clearingPct = (Number(market.clearingPrice) / 100).toFixed(2);

  return (
    <div className="space-y-4">
      {/* Clearing price */}
      <div className="bg-base border border-wire p-4 flex items-center justify-between">
        <div>
          <div className="data-label mb-1">CLEARING PRICE</div>
          <p className="font-body text-[12px] text-ink-secondary">First directional signal. Emitted once at epoch close.</p>
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="font-display text-4xl text-teal"
        >
          {clearingPct}%
        </motion.div>
      </div>

      {/* Pool bars */}
      <div>
        <div className="flex justify-between mb-3">
          <div>
            <div className="data-label">YES POOL</div>
            <div className="font-mono text-teal text-[15px] font-bold">
              {fmtEth(market.revealedYesPool)} ETH
              <span className="text-ink-dim text-[11px] ml-1.5">({yesPct.toFixed(1)}%)</span>
            </div>
          </div>
          <div className="text-right">
            <div className="data-label">NO POOL</div>
            <div className="font-mono text-crimson text-[15px] font-bold">
              {fmtEth(market.revealedNoPool)} ETH
              <span className="text-ink-dim text-[11px] ml-1.5">({noPct.toFixed(1)}%)</span>
            </div>
          </div>
        </div>
        <div className="h-3 bg-base border border-wire overflow-hidden flex">
          <motion.div
            className="h-full bg-teal"
            initial={{ width: 0 }}
            animate={{ width: `${yesPct}%` }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          />
          <motion.div
            className="h-full bg-crimson/70 flex-1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          />
        </div>
        <p className="font-mono text-[10px] text-ink-dim text-center mt-2 tracking-wider">
          P_t^dir = ∅ for all t &lt; t_close — revealed exactly once
        </p>
      </div>

      {/* Outcome */}
      {market.resolved && market.outcome !== UNRESOLVED && (
        <div className={`flex items-center gap-3 p-3 border ${
          market.outcome === SIDE_YES
            ? "border-teal/40 bg-teal-faint"
            : "border-crimson/40 bg-crimson/5"
        }`}>
          <span className="font-mono text-[10px] text-ink-dim">RESOLVED OUTCOME</span>
          <span className={`font-display text-2xl ${
            market.outcome === SIDE_YES ? "text-teal" : "text-crimson"
          }`}>
            {market.outcome === SIDE_YES ? "YES" : "NO"}
          </span>
        </div>
      )}
    </div>
  );
}
