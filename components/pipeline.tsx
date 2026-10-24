import { Reveal } from "./reveal";
import { SectionHead } from "./section-head";
import { Stamp, UploadCloud, Wand } from "./icons";

const steps = [
  {
    label: "Upload",
    title: "Drop in the pages.",
    copy: "Drop in your pages. HwaFlow gets them ready, with no extra software and no renaming files.",
  },
  {
    label: "Translate",
    title: "Let the run work.",
    copy: "HwaFlow reads the text, translates it, then gives it a second pass. Keep the tab open while it runs; finished text is saved as it goes. If the run stops, mark the chapter ready with what is there.",
  },
  {
    label: "Approve",
    title: "Check, then release.",
    copy: "Your team checks the words next to the page. A manager approves, and the work is credited. Changed your mind? You can undo it.",
  },
];

export function Pipeline() {
  return (
    <section id="pipeline" className="run-band">
      <div className="shell">
        <Reveal>
          <SectionHead
            label="The run"
            title={
              <>
                One run, from folder to{" "}
                <span className="display-serif">release</span>.
              </>
            }
            copy="A chapter can take a while, so the run happens in your browser against the panels you already have. Keep the tab open: finished text is saved as it goes, and a stopped run leaves the chapter in processing rather than losing the work."
          />
        </Reveal>

        <Reveal className="run-track">
          <svg
            className="run-path"
            viewBox="0 0 1200 12"
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            <line className="run-path-base" x1="0" y1="6" x2="1200" y2="6" />
            <line
              className="run-path-fill"
              x1="0"
              y1="6"
              x2="1200"
              y2="6"
              pathLength="100"
            />
          </svg>

          <div className="run-stations">
            <div className="run-station" data-step="1">
              <div className="run-artifact run-artifact--upload" aria-hidden="true">
                <span className="run-file">
                  <span>01</span>
                  <span>page-01.png</span>
                </span>
                <span className="run-file">
                  <span>02</span>
                  <span>page-02.png</span>
                </span>
                <span className="run-file run-file--ghost">
                  <UploadCloud className="h-3.5 w-3.5" />
                  <span>Drop the rest</span>
                </span>
                <span className="run-artifact-note">38 files ready</span>
              </div>

              <span className="run-dot" aria-hidden="true" />

              <div className="run-copy">
                <p className="run-label">{steps[0].label}</p>
                <h3>{steps[0].title}</h3>
                <p>{steps[0].copy}</p>
              </div>
            </div>

            <div className="run-station" data-step="2">
              <div
                className="run-artifact run-artifact--translate"
                aria-hidden="true"
              >
                <div className="run-artifact-head">
                  <span>
                    <Wand className="h-3.5 w-3.5" />
                    Translating
                  </span>
                  <b>63%</b>
                </div>
                <div className="run-bar">
                  <span style={{ width: "63%" }} />
                </div>
                <div className="run-passes">
                  <span className="is-done">Read</span>
                  <span className="is-active">Translate</span>
                  <span>Proofread</span>
                </div>
                <p className="run-source ko">그만두겠어. 이번이 진짜 마지막이야.</p>
              </div>

              <span className="run-dot" aria-hidden="true" />

              <div className="run-copy">
                <p className="run-label">{steps[1].label}</p>
                <h3>{steps[1].title}</h3>
                <p>{steps[1].copy}</p>
              </div>
            </div>

            <div className="run-station" data-step="3">
              <div
                className="run-artifact run-artifact--approve"
                aria-hidden="true"
              >
                <div className="run-stamp">
                  <Stamp className="h-4 w-4" />
                  <span>Approved</span>
                </div>
                <p className="run-approver">Mina · Manager</p>
                <div className="run-approve-foot">
                  <span>Ch. 42</span>
                  <span>+$4.50</span>
                </div>
              </div>

              <span className="run-dot" aria-hidden="true" />

              <div className="run-copy">
                <p className="run-label">{steps[2].label}</p>
                <h3>{steps[2].title}</h3>
                <p>{steps[2].copy}</p>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
