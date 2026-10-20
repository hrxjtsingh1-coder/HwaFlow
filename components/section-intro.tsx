import type { ReactNode } from "react";

export function SectionIntro({
  eyebrow,
  title,
  copy,
  className = "",
}: {
  eyebrow: string;
  title: ReactNode;
  copy?: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-4 text-[clamp(1.95rem,4vw,2.9rem)] font-semibold leading-[1.03] tracking-[-0.042em] text-ink">
        {title}
      </h2>
      {copy ? (
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
          {copy}
        </p>
      ) : null}
    </div>
  );
}
