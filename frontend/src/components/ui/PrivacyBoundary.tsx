const rows = [
  { layer: "Bid direction (YES/NO)",  during: "SEALED",    after: "NEVER REVEALED" },
  { layer: "Total ETH volume",        during: "PUBLIC",    after: "PUBLIC" },
  { layer: "Participant count",       during: "PUBLIC",    after: "PUBLIC" },
  { layer: "YES / NO pool split",     during: "SEALED",    after: "SINGLE REVEAL" },
  { layer: "Clearing price",          during: "—",         after: "AT EPOCH CLOSE" },
  { layer: "Individual payout",       during: "SEALED",    after: "RECIPIENT ONLY" },
];

export function PrivacyBoundary() {
  return (
    <div className="bg-surface border border-wire overflow-hidden">
      <div className="px-5 py-3 border-b border-wire">
        <span className="section-header">Information Topology</span>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-wire">
            <th className="text-left px-5 py-2.5 data-label">Layer</th>
            <th className="text-left px-5 py-2.5 data-label">During epoch</th>
            <th className="text-left px-5 py-2.5 data-label">After close</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={i}
              className={`${i < rows.length - 1 ? "border-b border-wire/50" : ""} hover:bg-panel/50 transition-colors`}
            >
              <td className="px-5 py-3 font-body text-[13px] text-ink-secondary">{r.layer}</td>
              <td className={`px-5 py-3 font-mono text-[11px] tracking-wider font-medium ${
                r.during === "SEALED" ? "text-gold" :
                r.during === "PUBLIC" ? "text-teal" : "text-ink-dim"
              }`}>
                {r.during === "SEALED" && <span className="inline-block w-2 h-2 bg-gold rounded-full mr-2 animate-pulse-gold" />}
                {r.during}
              </td>
              <td className={`px-5 py-3 font-mono text-[11px] tracking-wider font-medium ${
                r.after === "NEVER REVEALED" ? "text-ink-dim" :
                r.after === "RECIPIENT ONLY" ? "text-teal" :
                r.after.includes("REVEAL") || r.after === "PUBLIC" ? "text-teal" :
                "text-ink-secondary"
              }`}>
                {r.after}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
