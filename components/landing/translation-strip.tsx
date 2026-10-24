/**
 * The "read" proof, drawn as a flat comic long-strip. A scan band travels
 * down the page; each bubble flips from its Korean source to the English
 * line as the band passes it. Everything is one inline SVG so the motion is
 * cheap (transform + opacity only) and the final state is readable without JS.
 *
 * The animation is driven by `data-visible` on the parent Reveal, so it plays
 * once, when the section is actually on screen.
 */
export function TranslationStrip() {
  return (
    <div className="strip-frame">
      <svg
        className="translation-strip"
        viewBox="0 0 720 344"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <pattern
            id="strip-halftone"
            width="9"
            height="9"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="2" cy="2" r="1.1" fill="#121212" opacity="0.34" />
          </pattern>
          <pattern
            id="strip-halftone-dense"
            width="7"
            height="7"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="2" cy="2" r="1.4" fill="#121212" opacity="0.5" />
          </pattern>
          <clipPath id="strip-scene">
            <rect x="3" y="29" width="714" height="312" />
          </clipPath>
        </defs>

        {/* page */}
        <rect
          x="1.5"
          y="1.5"
          width="717"
          height="341"
          className="strip-paper"
          stroke="var(--ink)"
          strokeWidth="3"
        />

        {/* label band */}
        <rect x="3" y="3" width="714" height="26" className="strip-band" />
        <text x="15" y="20" className="strip-band-text">
          LONG-STRIP · 01–03
        </text>
        <text x="705" y="20" textAnchor="end" className="strip-band-text">
          KO → EN
        </text>

        <g clipPath="url(#strip-scene)">
          {/* sky + paper */}
          <rect x="3" y="29" width="714" height="312" className="strip-paper" />
          <rect x="3" y="29" width="714" height="186" className="strip-sky" />
          <rect
            x="3"
            y="29"
            width="714"
            height="312"
            fill="url(#strip-halftone)"
            opacity="0.5"
          />

          {/* sun */}
          <circle
            cx="592"
            cy="104"
            r="54"
            className="strip-peach"
            stroke="var(--ink)"
            strokeWidth="4"
          />
          <circle
            cx="592"
            cy="104"
            r="33"
            className="strip-paper"
            stroke="var(--ink)"
            strokeWidth="3"
          />

          {/* speed lines */}
          <g
            stroke="var(--ink)"
            strokeWidth="3"
            strokeLinecap="square"
            opacity="0.9"
          >
            <path d="M22 106h48" />
            <path d="M14 122h28" />
            <path d="M32 138h16" />
            <path d="M672 148h28" />
            <path d="M690 164h18" />
          </g>

          {/* far skyline */}
          <g
            className="strip-lavender"
            stroke="var(--ink)"
            strokeWidth="3"
            strokeLinejoin="miter"
          >
            <rect x="2" y="196" width="48" height="148" />
            <rect x="52" y="170" width="30" height="174" />
            <rect x="84" y="208" width="42" height="136" />
            <rect x="128" y="184" width="26" height="160" />
            <rect x="156" y="214" width="52" height="130" />
            <rect x="210" y="176" width="28" height="168" />
            <rect x="240" y="204" width="44" height="140" />
            <rect x="286" y="188" width="24" height="156" />
            <rect x="312" y="216" width="48" height="128" />
            <rect x="362" y="178" width="28" height="166" />
            <rect x="392" y="206" width="40" height="138" />
            <rect x="434" y="190" width="24" height="154" />
            <rect x="460" y="214" width="46" height="130" />
            <rect x="508" y="182" width="28" height="162" />
            <rect x="538" y="210" width="42" height="134" />
            <rect x="582" y="194" width="26" height="150" />
            <rect x="610" y="218" width="48" height="126" />
            <rect x="660" y="186" width="28" height="158" />
            <rect x="690" y="212" width="30" height="132" />
          </g>

          {/* near skyline */}
          <path
            d="M3 341V272h38v-20h32v26h28v-38h38v32h24v-18h40v24h28v-34h36v38h30v-16h34v26h34v-22h38v46h42v-28h32v30h34v-16h38v26h52v-40h30v40h40v-24h34v24h30v-34h38v34Z"
            className="strip-ink"
          />

          {/* rooftop hatch */}
          <g stroke="var(--paper)" strokeWidth="1.5" opacity="0.26">
            <path d="M3 326h714" />
            <path d="M16 306v35M44 306v35M72 306v35M100 306v35M128 306v35M156 306v35M184 306v35M212 306v35M240 306v35M268 306v35M296 306v35M324 306v35M352 306v35M380 306v35M408 306v35M436 306v35M464 306v35M492 306v35M520 306v35M548 306v35M576 306v35M604 306v35M632 306v35M660 306v35M688 306v35" />
          </g>

          {/* lower haze */}
          <rect
            x="3"
            y="248"
            width="714"
            height="93"
            fill="url(#strip-halftone-dense)"
            opacity="0.55"
          />

          {/* cut lines between parts */}
          <g
            stroke="var(--ink)"
            strokeWidth="1.5"
            strokeDasharray="5 5"
            opacity="0.4"
          >
            <path d="M240 29v312" />
            <path d="M480 29v312" />
          </g>

          {/* scan band (drawn under the bubbles so type stays crisp) */}
          <g className="strip-scan">
            <rect
              x="3"
              y="-30"
              width="714"
              height="30"
              className="strip-peach"
              opacity="0.5"
            />
            <rect x="3" y="0" width="714" height="3" className="strip-ink" />
          </g>

          {/* bubbles */}
          <g className="strip-bubble strip-bubble--1">
            <path
              d="M38 54H208V118H72L60 134 52 118H38Z"
              className="strip-paper"
              stroke="var(--ink)"
              strokeWidth="3"
              strokeLinejoin="miter"
            />
            <g className="strip-source">
              <text x="51" y="92" className="strip-ko">
                다들 어디있지 싶었어
              </text>
            </g>
            <g className="strip-target">
              <text x="51" y="92" className="strip-en">
                Where is everyone?
              </text>
            </g>
          </g>

          <g className="strip-bubble strip-bubble--2">
            <path
              d="M264 128H460V214H302L290 230 282 214H264Z"
              className="strip-paper"
              stroke="var(--ink)"
              strokeWidth="3"
              strokeLinejoin="miter"
            />
            <g className="strip-source">
              <text x="280" y="160" className="strip-ko">
                그때 보는 거야
              </text>
              <text x="280" y="178" className="strip-ko">
                내 미련함,
              </text>
            </g>
            <g className="strip-target">
              <text x="280" y="160" className="strip-en">
                That&rsquo;s when I saw it —
              </text>
              <text x="280" y="178" className="strip-en">
                my foolishness.
              </text>
            </g>
          </g>

          <g className="strip-bubble strip-bubble--3">
            <path
              d="M512 236H676V298H548L536 314 528 298H512Z"
              className="strip-paper"
              stroke="var(--ink)"
              strokeWidth="3"
              strokeLinejoin="miter"
            />
            <g className="strip-source">
              <text x="526" y="274" className="strip-ko">
                쉬고 있어
              </text>
            </g>
            <g className="strip-target">
              <text x="526" y="274" className="strip-en">
                Just rest.
              </text>
            </g>
          </g>

          {/* part tags */}
          <g className="strip-part-tag">
            <rect
              x="14"
              y="316"
              width="28"
              height="15"
              className="strip-paper"
              stroke="var(--ink)"
              strokeWidth="1.5"
            />
            <text x="28" y="327" textAnchor="middle" className="strip-part">
              01
            </text>
            <rect
              x="254"
              y="316"
              width="28"
              height="15"
              className="strip-paper"
              stroke="var(--ink)"
              strokeWidth="1.5"
            />
            <text x="268" y="327" textAnchor="middle" className="strip-part">
              02
            </text>
            <rect
              x="494"
              y="316"
              width="28"
              height="15"
              className="strip-paper"
              stroke="var(--ink)"
              strokeWidth="1.5"
            />
            <text x="508" y="327" textAnchor="middle" className="strip-part">
              03
            </text>
          </g>
        </g>
      </svg>

      {/* The SVG scales down on phones, so the same three lines are repeated
          at UI size there. Hidden once the strip is wide enough to read. */}
      <div className="strip-transcript" aria-hidden="true">
        <p>
          <span className="strip-transcript-no">01</span>
          <span className="strip-transcript-ko ko">다들 어디있지 싶었어</span>
          <span className="strip-transcript-en">Where is everyone?</span>
        </p>
        <p>
          <span className="strip-transcript-no">02</span>
          <span className="strip-transcript-ko ko">그때 보는 거야 내 미련함,</span>
          <span className="strip-transcript-en">
            That&rsquo;s when I saw it — my foolishness.
          </span>
        </p>
        <p>
          <span className="strip-transcript-no">03</span>
          <span className="strip-transcript-ko ko">쉬고 있어</span>
          <span className="strip-transcript-en">Just rest.</span>
        </p>
      </div>
    </div>
  );
}
