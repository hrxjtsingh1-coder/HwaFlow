import type { ReactNode } from "react";

export function SectionIntro({
  title,
  copy,
  className = "",
}: {
  title: ReactNode;
  copy?: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <h2 className="text-[clamp(1.95rem,4vw,2.9rem)] font-semibold leading-[1.03] tracking-[-0.042em] text-ink">
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
