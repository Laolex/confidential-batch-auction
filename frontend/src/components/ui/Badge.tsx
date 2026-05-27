import type { ReactNode } from "react";

type Variant = "gold" | "teal" | "crimson" | "dim" | "active";

const variants: Record<Variant, string> = {
  gold:    "bg-gold-faint text-gold border-gold-border",
  teal:    "bg-teal-faint text-teal border-teal-dim/40",
  crimson: "bg-crimson/10 text-crimson border-crimson/30",
  dim:     "bg-surface text-ink-secondary border-wire",
  active:  "bg-gold text-void border-gold",
};

export function Badge({ children, variant = "dim" }: { children: ReactNode; variant?: Variant }) {
  return (
    <span className={`status-pill border ${variants[variant]}`}>
      {children}
    </span>
  );
}
