const capabilities = [
  "Korean → English",
  "Japanese → English",
  "Chinese → English",
  "Reads every panel",
  "Two rounds of polish",
  "Names kept consistent",
  "Private group spaces",
  "Credit for approved work",
  "Weekly release plan",
  "Approvals you can undo",
];

function Row({ hidden = false }: { hidden?: boolean }) {
  return (
    <ul
      className="marquee-copy flex items-center"
      aria-hidden={hidden ? "true" : undefined}
    >
      {capabilities.map((item) => (
        <li
          key={item}
          className="inline-flex items-center gap-4 whitespace-nowrap px-5 text-[11.5px] font-medium tracking-[0.01em] text-muted"
        >
          <span
            aria-hidden="true"
            className="h-1 w-1 rotate-45 rounded-[1px] bg-[var(--border-strong)]"
          />
          {item}
        </li>
      ))}
    </ul>
  );
}

export function CapabilityMarquee() {
  return (
    <div className="marquee border-y border-border bg-surface/45 py-3.5">
      <div className="marquee-track">
        <Row />
        <Row hidden />
      </div>
    </div>
  );
}
