import type { ReactNode } from "react";
import { TranslationStrip } from "./landing/translation-strip";
import { Check } from "./icons";
import { Reveal } from "./reveal";
import { SectionHead } from "./section-head";

type Proof = {
  id: string;
  kicker: string;
  title: string;
  copy: string;
  tone: string;
  art: ReactNode;
};

const glossaryRows = [
  { source: "언니", target: "sis", origin: "manual" },
  { source: "회귀", target: "regression", origin: "manual" },
  { source: "폐하", target: "Your Majesty", origin: "manual" },
];

const ledgerRows = [
  { chapter: "Ch. 42", event: "approved", amount: "+$4.50", reversed: false },
  { chapter: "Ch. 41", event: "approved", amount: "+$4.50", reversed: false },
  {
    chapter: "Ch. 40",
    event: "approval undone",
    amount: "−$4.50",
    reversed: true,
  },
];

const proofs: Proof[] = [
  {
    id: "read",
    kicker: "Read",
    title: "Every panel gets read.",
    copy: "Pages are read in batches, with text kept in reading order, so sentences stay with the panel they belong to. Fancy fonts and vertical text get a fair shot, too.",
    tone: "sky",
    art: (
      <>
        <TranslationStrip />
        <div className="proof-caption">
          <span>38 panels</span>
          <span>read in batches · source kept</span>
        </div>
      </>
    ),
  },
  {
    id: "translate",
    kicker: "Translate",
    title: "Then it gets a second read.",
    copy: "First it says what’s there. Then it reads again the way an editor would, so the English sounds natural and means the same thing. You can compare both versions.",
    tone: "lavender",
    art: (
      <div className="proof-diff">
        <div className="proof-diff-row">
          <span className="proof-diff-label">Source</span>
          <p className="ko">그만두겠어. 이번이 진짜 마지막이야.</p>
        </div>
        <div className="proof-diff-row is-draft">
          <span className="proof-diff-label">First draft</span>
          <p>“I will quit. This time is really the last.”</p>
        </div>
        <div className="proof-diff-row is-final">
          <span className="proof-diff-label">Second pass</span>
          <p>“I’m done. This is really the last time.”</p>
          <span className="proof-note">
            <Check className="h-2.5 w-2.5" />
            Natural
          </span>
        </div>
      </div>
    ),
  },
  {
    id: "remember",
    kicker: "Remember",
    title: "Names that stay the same.",
    copy: "Keep character names, places, and titles consistent in every chapter. HwaFlow remembers your choices, marks auto-detected terms, and never overwrites a manual decision.",
    tone: "mint",
    art: (
      <div className="proof-ledger">
        <div className="proof-ledger-head">
          <span>Term</span>
          <span>Keep as</span>
          <span>Origin</span>
        </div>
        {glossaryRows.map((row) => (
          <div key={row.source} className="proof-ledger-row">
            <span className="ko">{row.source}</span>
            <span>{row.target}</span>
            <span className="proof-ledger-type">{row.origin}</span>
          </div>
        ))}
        <div className="proof-ledger-row is-new">
          <span className="ko">새 이름</span>
          <span>new name</span>
          <span className="proof-ledger-type">auto</span>
        </div>
      </div>
    ),
  },
  {
    id: "credit",
    kicker: "Credit",
    title: "Credit where it’s due.",
    copy: "Earnings follow approved chapters. If an approval is undone, the balance updates on its own, and the history stays visible.",
    tone: "peach",
    art: (
      <div className="proof-receipt">
        <div className="proof-receipt-head">
          <div>
            <span className="proof-receipt-label">Earned · October</span>
            <strong>$184.50</strong>
          </div>
          <span className="proof-receipt-chip">+$36.00 this week</span>
        </div>
        <div className="proof-receipt-rows">
          {ledgerRows.map((row) => (
            <div key={row.chapter} className="proof-receipt-row">
              <span>{row.chapter}</span>
              <span>{row.event}</span>
              <span className={row.reversed ? "is-reversed" : ""}>
                {row.amount}
              </span>
            </div>
          ))}
        </div>
        <div className="proof-receipt-foot">
          <span>32 approved chapters</span>
          <span>$5.77 average</span>
        </div>
      </div>
    ),
  },
];

export function Features() {
  return (
    <section id="product" className="proof-section">
      <div className="shell">
        <Reveal>
          <SectionHead
            label="The work"
            title="Everything after the raw upload."
            copy="From a folder of panels to clean English text your typesetter can use. Your team stays in charge of the words; HwaFlow handles the busywork."
          />
        </Reveal>

        <Reveal className="proof-list">
          {proofs.map((proof) => (
            <article key={proof.id} className="proof-row">
              <div className="proof-copy">
                <p className="proof-kicker">
                  <span
                    aria-hidden="true"
                    className={`proof-mark proof-mark--${proof.tone}`}
                  />
                  {proof.kicker}
                </p>
                <h3>{proof.title}</h3>
                <p>{proof.copy}</p>
              </div>
              <div
                className={`proof-art proof-art--${proof.id}`}
                aria-hidden="true"
              >
                {proof.art}
              </div>
            </article>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
