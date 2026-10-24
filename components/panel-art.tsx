/**
 * A flat, two-tone comic panel. No gradients, no blur — solid pastel fills,
 * a heavy ink outline and a halftone screen, in the same language as the UI.
 */
export function PanelArt({
  id = "panel",
  className = "h-full w-full",
}: {
  id?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 360 480"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <pattern
          id={`${id}-halftone`}
          width="8"
          height="8"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="2" cy="2" r="1.15" fill="#121212" opacity="0.5" />
        </pattern>
        <pattern
          id={`${id}-halftone-light`}
          width="10"
          height="10"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="2" cy="2" r="1" fill="#121212" opacity="0.28" />
        </pattern>
      </defs>

      {/* paper */}
      <rect width="360" height="480" fill="#F6F3EA" />

      {/* halftone sky band */}
      <rect width="360" height="300" fill={`url(#${id}-halftone-light)`} />

      {/* highlighter sun, hard edged */}
      <circle cx="256" cy="126" r="72" fill="#F1C7A4" stroke="#121212" strokeWidth="6" />
      <circle cx="256" cy="126" r="46" fill="#F6F3EA" stroke="#121212" strokeWidth="4" />

      {/* speed lines */}
      <g stroke="#121212" strokeWidth="4" strokeLinecap="square">
        <path d="M18 186h58" />
        <path d="M8 204h34" />
        <path d="M28 222h20" />
        <path d="M292 190h52" />
        <path d="M306 208h34" />
      </g>

      {/* distant skyline: pastel block */}
      <g
        fill="#CDBDFF"
        stroke="#121212"
        strokeWidth="5"
        strokeLinejoin="miter"
      >
        <rect x="-8" y="262" width="44" height="218" />
        <rect x="40" y="232" width="26" height="248" />
        <rect x="70" y="278" width="38" height="202" />
        <rect x="112" y="252" width="22" height="228" />
        <rect x="140" y="288" width="48" height="192" />
        <rect x="194" y="244" width="24" height="236" />
        <rect x="224" y="272" width="40" height="208" />
        <rect x="270" y="238" width="22" height="242" />
        <rect x="298" y="280" width="46" height="200" />
        <rect x="346" y="256" width="24" height="224" />
      </g>

      {/* near skyline: solid ink */}
      <path
        d="M0 480V348h34v-28h30v34h26v-52h34v38h20v-22h36v30h22v-44h30v46h26v-18h30v32h30v-26h32v60h-360Z"
        fill="#121212"
      />

      {/* rooftop hatch */}
      <g stroke="#F6F3EA" strokeWidth="2" opacity="0.28">
        <path d="M0 446h360" />
        <path d="M14 434v46M42 434v46M70 434v46M98 434v46M126 434v46M154 434v46M182 434v46M210 434v46M238 434v46M266 434v46M294 434v46M322 434v46M350 434v46" />
      </g>

      {/* figure, seen from behind */}
      <g fill="#121212">
        <circle cx="96" cy="306" r="18" />
        <path d="M88 338h16v14H88z" />
        <path d="M96 336c-9 0-18 5-24 14-7 11-11 26-13 42l-6 46h20l7-40 5-22 5 22 7 40h20l-6-46c-2-16-6-31-13-42-6-9-15-14-22-14Z" />
        <path d="M78 344c-15 3-27 12-35 26l9 6c7-11 17-18 30-20Z" />
      </g>

      {/* halftone overlay on the lower third */}
      <rect y="300" width="360" height="180" fill={`url(#${id}-halftone)`} />

      {/* panel border */}
      <rect
        x="3"
        y="3"
        width="354"
        height="474"
        fill="none"
        stroke="#121212"
        strokeWidth="6"
      />
    </svg>
  );
}
