import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-2.5"
      aria-label="HwaFlow home"
    >
      <span className="logo-mark transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105">
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M3.75 7.5A2.75 2.75 0 0 1 6.5 4.75h4.75A2.75 2.75 0 0 1 14 7.5v5.75a2.75 2.75 0 0 1-2.75 2.75H6.5a2.75 2.75 0 0 1-2.75-2.75V7.5Z"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M10 12.5A2.75 2.75 0 0 1 12.75 9.75H17.5a2.75 2.75 0 0 1 2.75 2.75v5.75A2.75 2.75 0 0 1 17.5 21h-4.75A2.75 2.75 0 0 1 10 18.25V12.5Z"
            fill="currentColor"
            fillOpacity="0.18"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      </span>
      <span className="text-[1.0625rem] font-semibold tracking-[-0.035em]">
        HwaFlow
      </span>
    </Link>
  );
}
