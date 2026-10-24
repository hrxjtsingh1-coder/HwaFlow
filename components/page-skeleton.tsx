import type { ReactNode } from "react";

/**
 * Loading placeholders for the route segments.
 *
 * These are server components on purpose: a `loading.tsx` must paint before any
 * JavaScript for the page exists, so nothing here may rely on state.
 *
 * Each skeleton reuses the page's own layout classes (`dash-hero`, `grp-stats`,
 * `sr-grid`, …) so the placeholder has the same shape as the content that
 * replaces it. Nothing here needs a state or a new stylesheet role.
 */

export function Sk({
  w = "100%",
  h = "0.85rem",
  r = "4px",
}: {
  w?: string;
  h?: string;
  r?: string;
}) {
  return (
    <span className="sk" style={{ width: w, height: h, borderRadius: r }} aria-hidden="true" />
  );
}

function RailSkeleton() {
  return (
    <aside className="dash-rail sk-rail" aria-hidden="true">
      <div className="sk-row">
        <Sk w="2.1rem" h="2.1rem" r="10px" />
        <Sk w="6rem" h="0.95rem" />
      </div>
      <div className="sk-gap" />
      {["5.5rem", "7rem", "6rem", "8rem", "4.5rem", "6.5rem"].map((w, index) => (
        <div className="sk-row sk-nav" key={index}>
          <Sk w="1.1rem" h="1.1rem" r="4px" />
          <Sk w={w} h="0.8rem" />
        </div>
      ))}
    </aside>
  );
}

/** The shared dashboard chrome: fixed rail, topbar, content column. */
export function ShellSkeleton({ children }: { children: ReactNode }) {
  return (
    <div className="dash-shell" aria-busy="true">
      <RailSkeleton />

      <div className="dash-body">
        <div className="dash-topbar" aria-hidden="true">
          <div className="sk-row">
            <Sk w="7rem" h="0.8rem" />
            <Sk w="0.5rem" h="0.5rem" r="50%" />
            <Sk w="5rem" h="0.8rem" />
          </div>
          <div className="sk-row">
            <Sk w="2.1rem" h="2.1rem" r="50%" />
            <Sk w="2.1rem" h="2.1rem" r="50%" />
          </div>
        </div>

        <main className="dash-main">
          <div className="dash-content sk-page">{children}</div>
        </main>
      </div>

      <p className="sk-sr">Loading…</p>
    </div>
  );
}

/** Content-only shell, for segments whose layout already draws the chrome. */
export function ContentSkeleton({ children }: { children: ReactNode }) {
  return (
    <div className="sk-page sk-content" aria-busy="true">
      {children}
      <p className="sk-sr">Loading…</p>
    </div>
  );
}

/** Eyebrow + title + trailing chip, the head of almost every panel. */
function PanelHeadSkeleton({ chip = true }: { chip?: boolean }) {
  return (
    <div className="dash-panel-head">
      <div className="sk-heading">
        <Sk w="5.5rem" h="0.65rem" />
        <Sk w="9rem" h="1.15rem" r="6px" />
      </div>
      {chip ? <Sk w="6rem" h="1.4rem" r="999px" /> : null}
    </div>
  );
}

/** Seven grey tiles, the week strip under the dashboard panels. */
function WeekStripSkeleton() {
  return (
    <div className="dash-calendar">
      {Array.from({ length: 7 }, (_, index) => (
        <Sk key={index} h="5.5rem" r="10px" />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* `/dashboard`                                                        */
/* ------------------------------------------------------------------ */

export function DashboardSkeleton() {
  return (
    <ShellSkeleton>
      <section className="dash-hero">
        <div className="dash-hero-copy">
          <Sk w="8rem" h="0.7rem" />
          <Sk w="min(26rem, 80%)" h="2.6rem" r="10px" />
          <Sk w="min(22rem, 70%)" h="0.9rem" />
          <Sk w="9.5rem" h="1.5rem" r="999px" />
        </div>
      </section>

      <div className="dash-grid dash-grid--split">
        <section className="dash-panel">
          <PanelHeadSkeleton />
          <Sk w="11rem" h="2.4rem" r="8px" />
          <Sk w="70%" h="0.85rem" />
          <Sk w="85%" h="0.7rem" />
        </section>

        <section className="dash-panel">
          <PanelHeadSkeleton />
          <Sk w="7rem" h="2.4rem" r="8px" />
          <Sk w="80%" h="0.85rem" />
          <div className="dash-spark">
            {[34, 58, 42, 88, 66, 28, 50].map((height, index) => (
              <Sk key={index} h={`${height}%`} r="4px" />
            ))}
          </div>
          <Sk w="90%" h="0.7rem" />
        </section>
      </div>

      <section className="dash-panel">
        <PanelHeadSkeleton />
        <WeekStripSkeleton />
      </section>
    </ShellSkeleton>
  );
}

/* ------------------------------------------------------------------ */
/* `/groups`                                                           */
/* ------------------------------------------------------------------ */

export function GroupsSkeleton() {
  return (
    <ShellSkeleton>
      <section className="grp-hero">
        <Sk w="6rem" h="0.7rem" />
        <Sk w="16rem" h="2.6rem" r="10px" />
        <Sk w="min(24rem, 80%)" h="0.9rem" />
      </section>

      <div className="grp-grid">
        {Array.from({ length: 6 }, (_, index) => (
          <article className="grp-card" key={index}>
            <div className="grp-card-link">
              <div className="grp-card-top">
                <Sk w="2.6rem" h="2.6rem" r="12px" />
                <Sk w="3rem" h="1.4rem" r="999px" />
              </div>
              <Sk w="70%" h="1.35rem" r="6px" />
              <Sk w="6rem" h="1.4rem" r="999px" />
              <div className="grp-card-counts">
                <Sk w="5.5rem" h="1.4rem" r="999px" />
                <Sk w="5rem" h="1.4rem" r="999px" />
              </div>
            </div>
          </article>
        ))}
      </div>
    </ShellSkeleton>
  );
}

/* ------------------------------------------------------------------ */
/* `/groups/[id]`                                                      */
/* ------------------------------------------------------------------ */

export function GroupDetailSkeleton() {
  return (
    <ShellSkeleton>
      <Sk w="5.5rem" h="0.8rem" />

      <section className="grp-group-head">
        <Sk w="3.6rem" h="3.6rem" r="16px" />
        <div className="grp-group-heading">
          <Sk w="3.5rem" h="0.65rem" />
          <Sk w="14rem" h="2rem" r="8px" />
          <div className="grp-group-meta">
            <Sk w="4.5rem" h="1.4rem" r="999px" />
            <Sk w="3rem" h="1.4rem" r="999px" />
            <Sk w="6rem" h="1rem" />
          </div>
        </div>
      </section>

      <div className="grp-stats">
        {Array.from({ length: 3 }, (_, index) => (
          <article className="grp-stat" key={index}>
            <Sk w="5.5rem" h="0.75rem" />
            <Sk w="6rem" h="1.9rem" r="6px" />
            <Sk w="8rem" h="0.75rem" />
          </article>
        ))}
      </div>

      <div className="grp-section-head">
        <div className="sk-heading">
          <Sk w="3.5rem" h="0.65rem" />
          <Sk w="7rem" h="1.4rem" r="6px" />
        </div>
        <div className="grp-section-actions">
          <Sk w="5rem" h="1.4rem" r="999px" />
          <Sk w="7rem" h="2rem" r="8px" />
        </div>
      </div>

      <div className="grp-days">
        {Array.from({ length: 7 }, (_, index) => (
          <div className="sk-panel" key={index}>
            <Sk w="40%" h="0.7rem" />
            <Sk h="4.5rem" r="10px" />
          </div>
        ))}
      </div>
    </ShellSkeleton>
  );
}

/* ------------------------------------------------------------------ */
/* `/groups/[id]/settings`                                             */
/* ------------------------------------------------------------------ */

export function GroupSettingsSkeleton() {
  return (
    <ShellSkeleton>
      <Sk w="9rem" h="0.8rem" />

      <section className="grp-group-head">
        <Sk w="3.6rem" h="3.6rem" r="16px" />
        <div className="grp-group-heading">
          <Sk w="3.5rem" h="0.65rem" />
          <Sk w="12rem" h="2rem" r="8px" />
          <div className="grp-group-meta">
            <Sk w="4.5rem" h="1.4rem" r="999px" />
            <Sk w="3rem" h="1.4rem" r="999px" />
          </div>
        </div>
      </section>

      <div className="grp-tabs">
        <Sk w="6.5rem" h="2.1rem" r="8px" />
        <Sk w="5rem" h="2.1rem" r="8px" />
      </div>

      <div className="sk-panel">
        <div className="sk-heading">
          <Sk w="2.5rem" h="0.65rem" />
          <Sk w="6rem" h="1.3rem" r="6px" />
        </div>
        {Array.from({ length: 4 }, (_, index) => (
          <div className="sk-row" key={index}>
            <Sk w="1.6rem" h="1.6rem" r="999px" />
            <Sk w="9rem" h="0.8rem" />
            <Sk w="4rem" h="1.2rem" r="999px" />
          </div>
        ))}
      </div>
    </ShellSkeleton>
  );
}

/* ------------------------------------------------------------------ */
/* `/series/[id]`                                                      */
/* ------------------------------------------------------------------ */

export function SeriesSkeleton() {
  return (
    <ShellSkeleton>
      <Sk w="8rem" h="0.8rem" />

      <section className="sr-hero">
        <div className="sr-hero-cover">
          <Sk w="9rem" h="12.5rem" r="10px" />
        </div>
        <div className="sr-hero-copy">
          <Sk w="3.5rem" h="0.65rem" />
          <Sk w="min(20rem, 80%)" h="2.4rem" r="8px" />
          <div className="sr-meta">
            <Sk w="5rem" h="1.4rem" r="999px" />
            <Sk w="4rem" h="1.4rem" r="999px" />
          </div>
          <Sk w="14rem" h="0.8rem" />
        </div>
      </section>

      <div className="sr-grid">
        <div className="sr-main">
          <section className="sr-panel">
            <PanelHeadSkeleton chip={false} />
            <Sk h="0.9rem" />
            <Sk w="90%" h="0.9rem" />
            <Sk w="60%" h="0.9rem" />
          </section>
          <section className="sr-panel">
            <PanelHeadSkeleton />
            {Array.from({ length: 5 }, (_, index) => (
              <div className="sk-row sk-list-row" key={index}>
                <Sk w="2rem" h="2rem" r="8px" />
                <Sk w={`${62 - index * 7}%`} h="0.85rem" />
                <Sk w="4.5rem" h="0.7rem" />
              </div>
            ))}
          </section>
        </div>

        <aside className="sr-side">
          <section className="sr-panel">
            <PanelHeadSkeleton chip={false} />
            {Array.from({ length: 5 }, (_, index) => (
              <div className="sk-row" key={index}>
                <Sk w="4.5rem" h="0.8rem" />
                <Sk w={`${52 - index * 5}%`} h="0.8rem" />
              </div>
            ))}
          </section>
          <section className="sr-panel">
            <PanelHeadSkeleton />
            {Array.from({ length: 3 }, (_, index) => (
              <div className="sk-row" key={index}>
                <Sk w="1.6rem" h="1.6rem" r="50%" />
                <Sk w={`${58 - index * 8}%`} h="0.85rem" />
              </div>
            ))}
          </section>
        </aside>
      </div>
    </ShellSkeleton>
  );
}

/* ------------------------------------------------------------------ */
/* `/chapters/[id]/workspace`                                          */
/* ------------------------------------------------------------------ */

export function WorkspaceSkeleton() {
  return (
    <ShellSkeleton>
      <div className="ws-grid">
        <aside className="ws-rail">
          <div className="sk-panel">
            <Sk w="45%" h="0.7rem" />
            {Array.from({ length: 8 }, (_, index) => (
              <Sk key={index} w={`${82 - index * 6}%`} h="0.8rem" />
            ))}
          </div>
        </aside>

        <section className="ws-center">
          <div className="sk-panel">
            <Sk w="35%" h="1.1rem" r="6px" />
            <Sk h="9rem" r="10px" />
            {Array.from({ length: 3 }, (_, index) => (
              <Sk key={index} w={`${70 - index * 8}%`} h="0.8rem" />
            ))}
          </div>
        </section>

        <aside className="ws-viewer">
          <div className="sk-panel">
            <Sk h="14rem" r="10px" />
          </div>
        </aside>
      </div>
    </ShellSkeleton>
  );
}

/* ------------------------------------------------------------------ */
/* `/admin/groups`                                                     */
/* ------------------------------------------------------------------ */

export function AdminGroupsSkeleton() {
  return (
    <ContentSkeleton>
      <section className="admin-page-head">
        <div className="sk-heading">
          <Sk w="4.5rem" h="0.65rem" />
          <Sk w="10rem" h="2.2rem" r="8px" />
          <Sk w="min(24rem, 80%)" h="0.85rem" />
        </div>
        <Sk w="8rem" h="2.5rem" r="8px" />
      </section>

      <div className="admin-toolbar">
        <Sk w="min(20rem, 100%)" h="2.6rem" r="8px" />
        <Sk w="8rem" h="2.6rem" r="8px" />
      </div>

      <div className="admin-grid">
        {Array.from({ length: 6 }, (_, index) => (
          <article className="admin-group-card" key={index}>
            <div className="admin-group-card-link">
              <div className="admin-group-card-top">
                <Sk w="2.6rem" h="2.6rem" r="12px" />
                <Sk w="3rem" h="1.4rem" r="999px" />
              </div>
              <Sk w="70%" h="1.35rem" r="6px" />
              <div className="admin-group-owner">
                <Sk w="1.9rem" h="1.9rem" r="50%" />
                <div className="sk-heading">
                  <Sk w="6rem" h="0.8rem" />
                  <Sk w="4rem" h="0.7rem" />
                </div>
              </div>
              <div className="admin-group-counts">
                <Sk w="5.5rem" h="1.4rem" r="999px" />
                <Sk w="5rem" h="1.4rem" r="999px" />
              </div>
            </div>
          </article>
        ))}
      </div>
    </ContentSkeleton>
  );
}

/* ------------------------------------------------------------------ */
/* `/admin/groups/[id]`                                                */
/* ------------------------------------------------------------------ */

export function AdminGroupDetailSkeleton() {
  return (
    <ContentSkeleton>
      <Sk w="5.5rem" h="0.8rem" />

      <section className="admin-detail-head">
        <Sk w="3.6rem" h="3.6rem" r="16px" />
        <div className="admin-detail-heading">
          <Sk w="3.5rem" h="0.65rem" />
          <Sk w="14rem" h="2rem" r="8px" />
          <div className="admin-detail-meta">
            <Sk w="6rem" h="1.2rem" r="6px" />
            <Sk w="3rem" h="1.4rem" r="999px" />
          </div>
        </div>
        <Sk w="10rem" h="2.2rem" r="8px" />
      </section>

      <div className="admin-stat-row">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="admin-stat" key={index}>
            <Sk w="5rem" h="0.75rem" />
            <Sk w="3.5rem" h="1.8rem" r="6px" />
          </div>
        ))}
      </div>

      <section className="admin-owner-card">
        <div className="admin-owner-main">
          <Sk w="2.6rem" h="2.6rem" r="50%" />
          <div className="sk-heading">
            <Sk w="3.5rem" h="0.65rem" />
            <Sk w="8rem" h="1rem" />
            <Sk w="10rem" h="0.8rem" />
          </div>
        </div>
        <Sk w="9rem" h="2.2rem" r="8px" />
      </section>

      <section className="admin-panel">
        <PanelHeadSkeleton />
        {Array.from({ length: 5 }, (_, index) => (
          <div className="sk-row sk-list-row" key={index}>
            <Sk w="1.8rem" h="1.8rem" r="50%" />
            <Sk w={`${55 - index * 6}%`} h="0.85rem" />
            <Sk w="4.5rem" h="0.7rem" />
            <Sk w="4rem" h="0.7rem" />
          </div>
        ))}
      </section>
    </ContentSkeleton>
  );
}
