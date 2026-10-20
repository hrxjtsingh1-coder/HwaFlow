import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function ArrowRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 12h15" />
      <path d="m13 6 6 6-6 6" />
    </Svg>
  );
}

export function ArrowUpRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </Svg>
  );
}

export function Check(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m4.5 12.5 5 5 10-11" />
    </Svg>
  );
}

export function Sparkles(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5c.6 3.7 1.8 4.9 5.5 5.5-3.7.6-4.9 1.8-5.5 5.5-.6-3.7-1.8-4.9-5.5-5.5C10.2 8.4 11.4 7.2 12 3.5Z" />
      <path d="M18.5 15.5c.3 1.9.9 2.5 2.8 2.8-1.9.3-2.5.9-2.8 2.8-.3-1.9-.9-2.5-2.8-2.8 1.9-.3 2.5-.9 2.8-2.8Z" />
      <path d="M5.5 16c.2 1.3.6 1.7 1.9 1.9-1.3.2-1.7.6-1.9 1.9-.2-1.3-.6-1.7-1.9-1.9 1.3-.2 1.7-.6 1.9-1.9Z" />
    </Svg>
  );
}

export function ScanText(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 8V6a2 2 0 0 1 2-2h2" />
      <path d="M16 4h2a2 2 0 0 1 2 2v2" />
      <path d="M20 16v2a2 2 0 0 1-2 2h-2" />
      <path d="M8 20H6a2 2 0 0 1-2-2v-2" />
      <path d="M8 9h8" />
      <path d="M8 12.5h5" />
      <path d="M8 16h7" />
    </Svg>
  );
}

export function Languages(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 6h9" />
      <path d="M7.5 4v2" />
      <path d="M10.5 6c-.7 4-2.9 6.7-6.5 8" />
      <path d="M5 10c1 2.2 2.8 3.8 5 4.7" />
      <path d="m12.5 20 4-10 4 10" />
      <path d="M14 16.5h5" />
    </Svg>
  );
}

export function Glossary(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v18H6.5A1.5 1.5 0 0 1 5 19.5v-15Z" />
      <path d="M8.5 3v18" />
      <path d="M12 8h4" />
      <path d="M12 11.5h4" />
    </Svg>
  );
}

export function ShieldCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3 5 6v5.5c0 4.3 2.9 7.6 7 9.5 4.1-1.9 7-5.2 7-9.5V6l-7-3Z" />
      <path d="m9 12 2 2 4-4.5" />
    </Svg>
  );
}

export function Coins(props: IconProps) {
  return (
    <Svg {...props}>
      <ellipse cx="9" cy="7" rx="5.5" ry="2.5" />
      <path d="M3.5 7v4c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5V7" />
      <path d="M3.5 11v4c0 1.4 2.5 2.5 5.5 2.5 1.4 0 2.7-.3 3.7-.8" />
      <circle cx="16.5" cy="15.5" r="4.5" />
      <path d="M16.5 13.5v4" />
      <path d="M14.8 14.3c.3-.5.9-.8 1.7-.8 1 0 1.7.4 1.7 1.1 0 1.6-3.4.8-3.4 2.3 0 .7.7 1.1 1.7 1.1.8 0 1.4-.3 1.7-.8" />
    </Svg>
  );
}

export function CalendarDays(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M8 14h2" />
      <path d="M14 14h2" />
      <path d="M8 17.5h2" />
    </Svg>
  );
}

export function UploadCloud(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 18.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.5-1.3A4.2 4.2 0 0 1 18 16.8" />
      <path d="M12 20V12" />
      <path d="m9 15 3-3 3 3" />
    </Svg>
  );
}

export function Wand(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m4 20 10.5-10.5" />
      <path d="m13 3 .8 2.2L16 6l-2.2.8L13 9l-.8-2.2L10 6l2.2-.8L13 3Z" />
      <path d="m19 11 .5 1.5L21 13l-1.5.5L19 15l-.5-1.5L17 13l1.5-.5L19 11Z" />
      <path d="M6.5 5.5 7 7l1.5.5L7 8l-.5 1.5L6 8l-1.5-.5L6 7l.5-1.5Z" />
    </Svg>
  );
}

export function Stamp(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 12.5c-.8-1.1-1.3-2.4-1.3-3.8a4.3 4.3 0 1 1 8.6 0c0 1.4-.5 2.7-1.3 3.8l-.5.8h-5l-.5-.8Z" />
      <path d="M8.5 16.5h7" />
      <path d="M5 20h14" />
      <path d="M9 16.5v-3.2" />
      <path d="M15 16.5v-3.2" />
    </Svg>
  );
}

export function Layers(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </Svg>
  );
}

export function Users(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c0-3 2.5-5.2 5.5-5.2s5.5 2.2 5.5 5.2" />
      <path d="M16 5.2a3 3 0 0 1 0 5.6" />
      <path d="M17 14.8c2.1.4 3.5 2.2 3.5 4.4" />
    </Svg>
  );
}

export function Menu(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </Svg>
  );
}

export function X(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </Svg>
  );
}

export function Play(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5v7l5.5-3.5L10 8.5Z" />
    </Svg>
  );
}

export function Lock(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4.5" y="10" width="15" height="11" rx="2.5" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
      <path d="M12 14.5v2.5" />
    </Svg>
  );
}

export function User(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20c0-3.6 3.1-6.2 7-6.2s7 2.6 7 6.2" />
    </Svg>
  );
}

export function AtSign(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3.6" />
      <path d="M15.6 8.4v4.4a2.8 2.8 0 0 0 5.4 1" />
      <path d="M20.4 12a8.4 8.4 0 1 0-3.2 6.6" />
    </Svg>
  );
}

export function Eye(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.9" />
    </Svg>
  );
}

export function EyeOff(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.2 4.2 19.8 19.8" />
      <path d="M9.7 6.2A9.6 9.6 0 0 1 12 5.8c6 0 9.5 6.2 9.5 6.2a16 16 0 0 1-3.2 3.9" />
      <path d="M6.4 7.5A16 16 0 0 0 2.5 12S6 18.2 12 18.2a9.7 9.7 0 0 0 4.1-.9" />
      <path d="M10.2 10.3a2.9 2.9 0 0 0 4 4" />
    </Svg>
  );
}

export function ArrowLeft(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 12H5" />
      <path d="m11 6-6 6 6 6" />
    </Svg>
  );
}

export function LogOut(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14.5 4.5H6A2.5 2.5 0 0 0 3.5 7v10A2.5 2.5 0 0 0 6 19.5h8.5" />
      <path d="M16 8.5 19.5 12 16 15.5" />
      <path d="M9.5 12h10" />
    </Svg>
  );
}

export function AlertCircle(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v5" />
      <path d="M12 16.2h.01" />
    </Svg>
  );
}
