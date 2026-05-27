import { useState } from "react";
import { useAccount } from "wagmi";
import { motion } from "framer-motion";
import { usePlaceBet } from "@/hooks/usePlaceBet";
import { useAppStore } from "@/store/appStore";
import { Spinner } from "@/components/ui/Spinner";
import { SIDE_YES, SIDE_NO } from "@/types";

interface BetPanelProps {
  marketId: number;
  onSuccess?: () => void;
}

export function BetPanel({ marketId, onSuccess }: BetPanelProps) {
  const { isConnected } = useAccount();
  const { fheStatus } = useAppStore();
  const { placeBet, isPending } = usePlaceBet();
  const [side, setSide] = useState<number>(SIDE_YES);
  const [amount, setAmount] = useState("0.01");

  const fheReady = fheStatus === "ready";

  async function handleSubmit() {
    await placeBet(marketId, side, amount);
    onSuccess?.();
  }

  if (!isConnected) {
    return (
      <div className="py-6 text-center">
        <div className="font-mono text-[10px] tracking-widest text-ink-dim mb-2">AUTHENTICATION REQUIRED</div>
        <p className="font-body text-ink-secondary text-[14px]">Connect wallet to place a sealed bid.</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-4"
    >
      {/* Side selector */}
      <div>
        <div className="data-label mb-3">SELECT POSITION</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setSide(SIDE_YES)}
            disabled={isPending}
            className={`py-3.5 font-mono text-[13px] tracking-widest transition-all border ${
              side === SIDE_YES
                ? "bg-teal/10 border-teal text-teal"
                : "bg-transparent border-wire text-ink-dim hover:border-ink-secondary hover:text-ink-secondary"
            }`}
          >
            YES ▲
          </button>
          <button
            onClick={() => setSide(SIDE_NO)}
            disabled={isPending}
            className={`py-3.5 font-mono text-[13px] tracking-widest transition-all border ${
              side === SIDE_NO
                ? "bg-crimson/10 border-crimson text-crimson"
                : "bg-transparent border-wire text-ink-dim hover:border-ink-secondary hover:text-ink-secondary"
            }`}
          >
            NO ▼
          </button>
        </div>
      </div>

      {/* Amount input */}
      <div>
        <div className="data-label mb-2">CAPITAL COMMITMENT (ETH)</div>
        <div className="relative">
          <input
            type="number"
            step="0.001"
            min="0.001"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={isPending}
            className="intel-input pr-12"
            placeholder="0.01"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-ink-dim">ETH</span>
        </div>
        <p className="font-mono text-[10px] text-ink-dim mt-1.5">
          Side is encrypted. Only commitment amount is public.
        </p>
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={isPending || !fheReady}
        className="btn-gold w-full flex items-center justify-center gap-3"
      >
        {isPending ? (
          <>
            <Spinner size={14} />
            <span>ENCRYPTING + SUBMITTING</span>
          </>
        ) : (
          <>
            <span className="text-[15px]">⬡</span>
            <span>SEAL & SUBMIT BID</span>
          </>
        )}
      </button>

      {/* FHE status */}
      {!fheReady && (
        <div className="flex items-center gap-2 py-2">
          <span className="w-1.5 h-1.5 rounded-full bg-gold-dim animate-pulse-gold" />
          <span className="font-mono text-[10px] text-ink-dim">
            {fheStatus === "initializing" ? "INITIALIZING FHE RELAYER…" : "FHE OFFLINE — CONNECT WALLET"}
          </span>
        </div>
      )}
    </motion.div>
  );
}
