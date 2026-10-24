import type { ReactNode } from "react";

export function SectionHead({
  label,
  title,
  copy,
  className = "",
}: {
  label: string;
  title: ReactNode;
  copy?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`section-head ${className}`}>
      <p className="section-head-label">
        <span aria-hidden="true" className="section-head-mark" />
        {label}
      </p>
      <h2 className="section-head-title">{title}</h2>
      {copy ? <p className="section-head-copy">{copy}</p> : null}
    </header>
  );
}
