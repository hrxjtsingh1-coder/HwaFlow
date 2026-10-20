export function PanelArt({
  id = "panel",
  className = "h-full w-full",
  showFigure = true,
}: {
  id?: string;
  className?: string;
  showFigure?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 360 480"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0%" stopColor="#f2e5ff" />
          <stop offset="44%" stopColor="#ffd8c4" />
          <stop offset="100%" stopColor="#fff0d9" />
        </linearGradient>
        <radialGradient id={`${id}-sun`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff6d8" />
          <stop offset="55%" stopColor="#ffe0ad" />
          <stop offset="100%" stopColor="#ffc9a1" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-far`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c9b9e6" />
          <stop offset="100%" stopColor="#b3a2d4" />
        </linearGradient>
        <linearGradient id={`${id}-near`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6d6289" />
          <stop offset="100%" stopColor="#4a4162" />
        </linearGradient>
        <linearGradient id={`${id}-ink`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#332e44" />
          <stop offset="100%" stopColor="#221f2f" />
        </linearGradient>
        <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="55%" stopColor="#1b1c22" stopOpacity="0" />
          <stop offset="100%" stopColor="#1b1c22" stopOpacity="0.26" />
        </linearGradient>
        <pattern
          id={`${id}-hatch`}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(35)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="6"
            stroke="#1b1c22"
            strokeOpacity="0.09"
            strokeWidth="1"
          />
        </pattern>
        <filter id={`${id}-blur`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>

      <rect width="360" height="480" fill={`url(#${id}-sky)`} />

      {/* sun + haze */}
      <circle cx="258" cy="128" r="118" fill={`url(#${id}-sun)`} />
      <circle cx="258" cy="128" r="47" fill="#fff3d0" opacity="0.92" />
      <g fill="#ffe6c6" opacity="0.55" filter={`url(#${id}-blur)`}>
        <ellipse cx="128" cy="96" rx="62" ry="12" />
        <ellipse cx="300" cy="72" rx="46" ry="9" />
        <ellipse cx="70" cy="168" rx="54" ry="10" />
      </g>

      {/* distant skyline */}
      <g fill={`url(#${id}-far)`} opacity="0.72">
        <rect x="-8" y="262" width="44" height="218" rx="2" />
        <rect x="40" y="232" width="26" height="248" rx="2" />
        <rect x="70" y="278" width="38" height="202" rx="2" />
        <rect x="112" y="252" width="22" height="228" rx="2" />
        <rect x="140" y="288" width="48" height="192" rx="2" />
        <rect x="194" y="244" width="24" height="236" rx="2" />
        <rect x="224" y="272" width="40" height="208" rx="2" />
        <rect x="270" y="238" width="22" height="242" rx="2" />
        <rect x="298" y="280" width="46" height="200" rx="2" />
        <rect x="346" y="256" width="24" height="224" rx="2" />
        <path d="M53 232v-30h3v30zM281 238v-42h2v42z" />
      </g>

      {/* near skyline */}
      <g fill={`url(#${id}-near)`} opacity="0.92">
        <path d="M0 480V348h34v-28h30v34h26v-52h34v38h20v-22h36v30h22v-44h30v46h26v-18h30v32h30v-26h32v60h-360Z" />
        <g fill="#1b1c22" opacity="0.18">
          <rect x="17" y="332" width="5" height="8" />
          <rect x="28" y="332" width="5" height="8" />
          <rect x="76" y="310" width="5" height="8" />
          <rect x="88" y="310" width="5" height="8" />
          <rect x="160" y="326" width="5" height="8" />
          <rect x="236" y="302" width="5" height="8" />
          <rect x="248" y="302" width="5" height="8" />
          <rect x="304" y="322" width="5" height="8" />
          <rect x="316" y="322" width="5" height="8" />
        </g>
      </g>

      {/* speed lines */}
      <g
        stroke="#1b1c22"
        strokeOpacity="0.28"
        strokeWidth="1.4"
        strokeLinecap="round"
      >
        <path d="M24 194h64" />
        <path d="M12 210h38" />
        <path d="M32 226h22" />
        <path d="M300 208h48" />
        <path d="M316 224h30" />
        <path d="M286 240h18" />
        <path d="M40 118h18" />
        <path d="M316 156h24" />
      </g>

      {/* birds */}
      <g
        fill="none"
        stroke="#4a4162"
        strokeOpacity="0.55"
        strokeWidth="1.4"
        strokeLinecap="round"
      >
        <path d="M148 118c4-5 8-5 12 0 4-5 8-5 12 0" />
        <path d="M178 100c3-4 6-4 9 0 3-4 6-4 9 0" />
      </g>

      {/* rooftop */}
      <path
        d="M0 480V430h72v-10h58v16h84v-14h70v18h76v40H0Z"
        fill={`url(#${id}-ink)`}
      />
      <g stroke="#15141c" strokeOpacity="0.45" strokeWidth="2">
        <path d="M0 438h360" />
        <path d="M16 438v26M44 438v26M72 438v26M100 438v26M128 438v26M156 438v26M184 438v26M212 438v26M240 438v26M268 438v26M296 438v26M324 438v26M352 438v26" />
      </g>

      {/* figure, seen from behind */}
      {showFigure ? (
        <g fill="#1d1a27">
          <path
            d="M96 301c-10 0-18 8-18 18s8 18 18 18 18-8 18-18-8-18-18-18Z"
            opacity="0.96"
          />
          <path d="M88 338h16v12H88z" />
          <path d="M96 336c-9 0-18 5-24 14-7 11-11 26-13 42l-6 46h20l7-40 5-22 5 22 7 40h20l-6-46c-2-16-6-31-13-42-6-9-15-14-22-14Z" />
          <path
            d="M78 344c-15 3-27 12-35 26l7 5c7-11 17-18 30-20Z"
            opacity="0.9"
          />
          <path
            d="M82 294c3-13 13-21 26-19 10 2 16 10 15 21-6-7-14-11-24-9-6 1-12 4-17 7Z"
          />
        </g>
      ) : null}

      {/* lens flare */}
      <g fill="#fff8e8">
        <circle cx="258" cy="128" r="4" opacity="0.9" />
        <circle cx="284" cy="154" r="2" opacity="0.6" />
        <circle cx="232" cy="106" r="2.5" opacity="0.5" />
      </g>

      <rect width="360" height="480" fill={`url(#${id}-hatch)`} />
      <rect width="360" height="480" fill={`url(#${id}-fade)`} />
    </svg>
  );
}
