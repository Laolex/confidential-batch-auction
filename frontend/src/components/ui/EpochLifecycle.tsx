import type { EpochStatus } from "@/types";

const STEPS: { label: string; sub: string; status: EpochStatus }[] = [
  { label: "ACCUMULATING",  sub: "Sealed capital flowing in",       status: "accumulating" },
  { label: "EPOCH CLOSED",  sub: "No new bids accepted",            status: "closed" },
  { label: "RESOLVED",      sub: "Outcome committed on-chain",      status: "resolving" },
  { label: "POOL REVEAL",   sub: "Aggregate split decrypted",       status: "revealing" },
  { label: "PRICE LIVE / SETTLE", sub: "Clearing price live · claim payouts", status: "revealed" },
];

const ORDER: EpochStatus[] = ["accumulating", "closed", "resolving", "revealing", "revealed"];

function stepState(current: EpochStatus, step: EpochStatus) {
  const ci = ORDER.indexOf(current);
  const si = ORDER.indexOf(step);
  if (ci > si) return "done";
  if (ci === si) return "active";
  return "pending";
}

export function EpochLifecycle({ status }: { status: EpochStatus }) {
  return (
    <div className="space-y-px">
      {STEPS.map(({ label, sub, status: s }, i) => {
        const state = stepState(status, s);
        return (
          <div
            key={s}
            className={`flex items-start gap-4 px-4 py-3 transition-colors ${
              state === "active" ? "bg-gold-faint border-l-2 border-gold" :
              state === "done" ? "border-l-2 border-teal/30" :
              "border-l-2 border-wire"
            }`}
          >
            {/* Step number / indicator */}
            <div className="flex-shrink-0 mt-0.5">
              {state === "done" ? (
                <div className="w-5 h-5 flex items-center justify-center">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="#2EC4B6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              ) : state === "active" ? (
                <div className="w-5 h-5 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-gold animate-pulse-gold" />
                </div>
              ) : (
                <div className="w-5 h-5 flex items-center justify-center">
                  <span className="font-mono text-[10px] text-ink-dim">{String(i + 1).padStart(2, "0")}</span>
                </div>
              )}
            </div>

            {/* Content */}
            <div className="min-w-0">
              <div className={`font-mono text-[11px] tracking-widest ${
                state === "active" ? "text-gold" :
                state === "done" ? "text-teal" :
                "text-ink-dim"
              }`}>
                {label}
              </div>
              <div className={`font-body text-[12px] mt-0.5 ${
                state === "active" ? "text-ink-secondary" : "text-ink-dim"
              }`}>
                {sub}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
