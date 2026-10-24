import { PanelArt } from "./panel-art";
import {
  Check,
  Glossary,
  Languages,
  ScanText,
  Stamp,
  Wand,
} from "./icons";

const chapters = [
  { number: "42", status: "Translating", current: true },
  { number: "41", status: "Approved", current: false },
  { number: "40", status: "Approved", current: false },
  { number: "39", status: "Approved", current: false },
  { number: "38", status: "Approved", current: false },
  { number: "37", status: "Approved", current: false },
];

const blocks = [
  {
    index: "01",
    source: "그만두겠어. 이번이 진짜 마지막이야.",
    final: "I'm done. This is really the last time.",
    tag: "Edited",
    tone: "muted",
    active: true,
  },
  {
    index: "02",
    source: "네가 그렇게 말할 줄 알았어.",
    final: "I knew you'd say that.",
    tag: "",
    tone: "",
    active: false,
  },
  {
    index: "03",
    source: "…언니, 제발.",
    final: "…Sis, please.",
    tag: "Check",
    tone: "warn",
    active: false,
  },
  {
    index: "04",
    source: "…괜찮아.",
    final: "…It's fine.",
    tag: "",
    tone: "",
    active: false,
  },
];

export function WorkspacePreview() {
  return (
    <div className="ws-preview" aria-hidden="true">
      <div className="ws-topbar">
        <div className="ws-crumbs">
          <span className="ws-crumb">Groups</span>
          <span className="ws-crumb-sep">/</span>
          <span className="ws-crumb">manhwa</span>
          <span className="ws-crumb-sep">/</span>
          <span className="ws-crumb-current">Chapter 42</span>
        </div>

        <div className="ws-topbar-right">
          <span className="ws-saved">
            <Check className="h-3 w-3" />
            Saved
          </span>
          <span className="ws-avatar-stack">
            <span className="ws-avatar ws-avatar--lavender">YS</span>
            <span className="ws-avatar ws-avatar--mint">MK</span>
            <span className="ws-avatar ws-avatar--peach">JP</span>
          </span>
        </div>
      </div>

      <div className="ws-grid">
        <aside className="ws-rail">
          <div className="ws-tabs">
            <span className="ws-tab is-active">
              Chapters <b>{chapters.length}</b>
            </span>
            <span className="ws-tab">
              Glossary <b>14</b>
            </span>
          </div>

          <div className="ws-rail-list">
            {chapters.map((chapter) => (
              <div
                key={chapter.number}
                className={`ws-chapter ${chapter.current ? "is-current" : ""}`}
              >
                <span
                  className="ws-chapter-dot"
                  data-state={chapter.current ? "active" : "done"}
                />
                <span className="ws-chapter-number">Ch. {chapter.number}</span>
                <span className="ws-chapter-status">{chapter.status}</span>
              </div>
            ))}
          </div>

          <div className="ws-rail-add">+ New chapter</div>

          <div className="ws-rail-foot">
            <Glossary className="h-3 w-3" />
            14 terms kept
          </div>
        </aside>

        <section className="ws-center">
          <div className="ws-mobile-tabs">
            <span className="ws-mobile-tab is-active">Chapter</span>
            <span className="ws-mobile-tab">Text</span>
            <span className="ws-mobile-tab">Raw</span>
          </div>

          <div className="ws-ch-head">
            <div className="ws-ch-main">
              <div className="ws-ch-title-row">
                <span className="ws-ch-number">
                  Chapter <b>42</b>
                </span>
                <span className="ws-status">
                  <span className="ws-status-dot" />
                  Translating
                </span>
              </div>
              <p className="ws-ch-title">Untitled chapter</p>
              <p className="ws-ch-sub">manhwa · 38 panels · 2 translators</p>
            </div>

            <div className="ws-ch-actions">
              <span className="ws-btn ws-btn-ghost">Mark ready</span>
              <span className="ws-btn ws-btn-primary">
                <Stamp className="h-3 w-3" />
                Submit
              </span>
            </div>
          </div>

          <div className="ws-editor">
            <div className="ws-editor-head">
              <span className="ws-editor-title">Panel 7 of 38</span>
              <span className="ws-editor-hint">
                <Languages className="h-3 w-3" />
                Second pass
              </span>
              <span className="ws-mobile-thumb">
                <PanelArt id="ws-mobile-thumb" className="h-full w-full" />
              </span>
            </div>

            <div className="ws-bubbles">
              {blocks.map((block) => (
                <div
                  key={block.index}
                  className={`ws-bubble ${block.active ? "is-active" : ""}`}
                >
                  <span className="ws-bubble-index">{block.index}</span>
                  <div className="ws-bubble-body">
                    <p className="ws-bubble-final">{block.final}</p>
                    <p className="ws-bubble-source ko">{block.source}</p>
                  </div>
                  {block.tag ? (
                    <span
                      className={`ws-bubble-tag ${
                        block.tone === "warn" ? "is-warn" : ""
                      }`}
                    >
                      {block.tag}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="ws-editor-note">
              <span>Panel note</span>
              <p>No text outside the boxes. Keep the sign lettering as-is.</p>
            </div>
          </div>
        </section>

        <aside className="ws-viewer">
          <div className="ws-viewer-head">
            <div>
              <span className="ws-eyebrow">Raw panel</span>
              <p className="ws-viewer-count">Panel 7 of 38</p>
            </div>
            <div className="ws-viewer-actions">
              <span className="ws-mini-btn">
                <ScanText className="h-2.5 w-2.5" />
                Boxes
              </span>
              <span className="ws-mini-btn">Upload</span>
            </div>
          </div>

          <div className="ws-panel-frame">
            <PanelArt id="workspace-panel" className="ws-panel-art" />
            <span className="ws-bbox ws-bbox--a">
              <span>01</span>
            </span>
            <span className="ws-bbox ws-bbox--b">
              <span>02</span>
            </span>
            <span className="ws-bbox ws-bbox--c">
              <span>03</span>
            </span>
          </div>

          <div className="ws-viewer-foot">
            <span>Click a box to jump to the text</span>
            <span>1280 × 1800</span>
          </div>

          <div className="ws-run">
            <div className="ws-run-head">
              <span>
                <Wand className="h-3 w-3" />
                Translating…
              </span>
              <b>24 / 38</b>
            </div>
            <div className="ws-run-bar">
              <span style={{ width: "63%" }} />
            </div>
            <div className="ws-run-stages">
              <span className="is-done">Read</span>
              <span className="is-active">Translate</span>
              <span>Proofread</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
