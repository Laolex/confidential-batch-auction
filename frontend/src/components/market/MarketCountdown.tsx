import { useEffect, useState } from "react";

function fmt(secs: number) {
  if (secs <= 0) return "00:00:00";
  const h = Math.floor(secs / 3600).toString().padStart(2, "0");
  const m = Math.floor((secs % 3600) / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function MarketCountdown({ epochEnd }: { epochEnd: number }) {
  const [secs, setSecs] = useState(() => Math.max(0, epochEnd - Math.floor(Date.now() / 1000)));

  useEffect(() => {
    const id = setInterval(() => {
      setSecs(Math.max(0, epochEnd - Math.floor(Date.now() / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [epochEnd]);

  const expired = secs === 0;
  const urgent = secs > 0 && secs < 300;

  return (
    <div className={`font-mono tabular-nums text-xl font-bold tracking-widest ${
      expired ? "text-ink-dim" : urgent ? "text-gold animate-pulse-gold" : "text-ink-primary"
    }`}>
      {expired ? "CLOSED" : fmt(secs)}
    </div>
  );
}
