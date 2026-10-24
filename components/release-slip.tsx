import { Check, Stamp } from "./icons";

/**
 * A small piece of paper from the release desk. It is product evidence, not
 * UI: everything in it maps to a real state in the chapter workflow.
 */
export function ReleaseSlip() {
  return (
    <aside className="release-slip" aria-hidden="true">
      <div className="release-slip-head">
        <span className="release-slip-label">Release slip</span>
        <span className="release-slip-status">
          <Check className="h-3 w-3" />
          Approved
        </span>
      </div>

      <p className="release-slip-series">manhwa</p>
      <p className="release-slip-chapter">Chapter 42 · release copy</p>

      <dl className="release-slip-rows">
        <div>
          <dt>Panels</dt>
          <dd>38</dd>
        </div>
        <div>
          <dt>Passes</dt>
          <dd>2</dd>
        </div>
        <div>
          <dt>Approved by</dt>
          <dd>Mina</dd>
        </div>
      </dl>

      <div className="release-slip-stamp">
        <Stamp className="h-4 w-4" />
        <span>Approved</span>
      </div>

      <div className="release-slip-foot">
        <span>Credit</span>
        <strong>+$4.50</strong>
      </div>
    </aside>
  );
}
