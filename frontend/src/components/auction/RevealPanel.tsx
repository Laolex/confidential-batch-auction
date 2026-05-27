import { useRevealPools } from "@/hooks/useReveal";
import { Spinner } from "@/components/ui/Spinner";
import { useAppStore } from "@/store/appStore";
import type { MarketView } from "@/types";

interface RevealPanelProps {
  market: MarketView;
  isCreator: boolean;
  onSuccess?: () => void;
}

export function RevealPanel({ market, isCreator, onSuccess }: RevealPanelProps) {
  const { fheStatus } = useAppStore();
  const { revealPools, isPending, error } = useRevealPools(market.id);
  const fheReady = fheStatus === "ready";

  if (market.poolRevealed) return null;
  if (market.epochStatus !== "resolving" && market.epochStatus !== "revealing") return null;

  return (
    <div className="space-y-3">
      <div>
        <div className="data-label mb-1">AGGREGATE POOL REVEAL</div>
        <p className="font-body text-[13px] text-ink-secondary">
          Decrypt and publish YES/NO pool composition. Directional split becomes public exactly once.
        </p>
      </div>
      <button
        onClick={() => revealPools(market.poolRevealRequested).then(() => onSuccess?.())}
        disabled={isPending || !fheReady}
        className="btn-gold flex items-center gap-3"
      >
        {isPending ? (
          <>
            <Spinner size={14} />
            <span>DECRYPTING POOLS</span>
          </>
        ) : (
          "DECLASSIFY AGGREGATE POOLS"
        )}
      </button>
      {error && (
        <p className="font-mono text-[11px] text-crimson">{error}</p>
      )}
    </div>
  );
}
