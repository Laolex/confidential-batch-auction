import type { EpochStatus } from "@/types";
import { Badge } from "@/components/ui/Badge";

const cfg: Record<EpochStatus, { label: string; variant: "gold" | "teal" | "crimson" | "dim" | "active" }> = {
  accumulating: { label: "LIVE",       variant: "active" },
  closed:       { label: "CLOSED",     variant: "dim" },
  resolving:    { label: "RESOLVING",  variant: "gold" },
  revealing:    { label: "REVEALING",  variant: "teal" },
  revealed:     { label: "REVEALED",   variant: "teal" },
};

export function MarketStatusBadge({ status }: { status: EpochStatus }) {
  const { label, variant } = cfg[status];
  return <Badge variant={variant}>{label}</Badge>;
}
