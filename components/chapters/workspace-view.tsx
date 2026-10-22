"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { signOut } from "@/lib/auth";
import {
  addPanels,
  ChapterError,
  canEditChapter,
  deleteChapter,
  setChapterStatus,
  updateBlockText,
  updateChapterDetails,
  type Chapter,
  type ChapterStatus,
} from "@/lib/chapters";
import { activeGlossaryTerms, type GlossaryTerm } from "@/lib/glossary";
import { compressPanel, PanelImageError } from "@/lib/panel-image";
import { deleteChapterImages } from "@/lib/panel-store";
import {
  activeRunChapterId,
  cancelRun,
  retryFailed,
  startRun,
  type RunState,
} from "@/lib/pipeline";
import { canManageSeries } from "@/lib/series";
import { useAuthSession } from "@/lib/use-auth-session";
import { useChapters } from "@/lib/use-chapters";
import { useGlossary } from "@/lib/use-glossary";
import { useGroups } from "@/lib/use-groups";
import { usePipeline } from "@/lib/use-pipeline";
import { useSeries } from "@/lib/use-series";
import { DashboardRail } from "../dashboard/dashboard-rail";
import { DashboardTopbar } from "../dashboard/dashboard-topbar";
import { workspaceLinks } from "../dashboard/workspace-nav";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Clock,
  Play,
  Stamp,
} from "../icons";
import { Logo } from "../logo";
import { BlockEditor } from "./block-editor";
import { ChapterRail, type RailTab } from "./chapter-rail";
import { ChapterStatusChip } from "./chapter-status-dot";
import { DeleteChapterDialog } from "./delete-chapter-dialog";
import { GlossaryPanel } from "./glossary-panel";
import { PanelViewer } from "./panel-viewer";
import type { UploadProgress } from "./panel-dropzone";
import { RejectChapterDialog } from "./reject-chapter-dialog";

const PREFS_KEY = "hwaflow.workspace.prefs.v1";

type Notice = { tone: "success" | "error"; text: string };

const IDLE_RUN: RunState = {
  running: false,
  stage: "done",
  totalPanels: 0,
  extracted: 0,
  batchIndex: 1,
  batchCount: 1,
  panels: {},
  error: null,
};

function WorkspaceLoading() {
  return (
    <div className="dash-loading">
      <div className="dash-loading-inner">
        <Logo href="/" />
        <div className="dash-loading-card" role="status" aria-live="polite">
          <span className="dash-spinner" aria-hidden="true" />
          <p>Opening the chapter…</p>
        </div>
      </div>
    </div>
  );
}

/**
 * The chapter workspace.
 *
 * Three columns behind the collapsed main rail: chapters + glossary on the
 * left, the translated text in the middle, the raw art on the right. The
 * pipeline is client-driven; this component is the only place that starts it.
 */
export function WorkspaceView({ chapterId }: { chapterId: string }) {
  const router = useRouter();
  const { user, ready: authReady } = useAuthSession();
  const { state: groupsState, ready: groupsReady } = useGroups();
  const { state: seriesState, ready: seriesReady } = useSeries();
  const { state: chapterState, ready: chaptersReady } = useChapters();
  const { state: glossaryState, ready: glossaryReady } = useGlossary();
  const live = usePipeline();

  const [menuOpen, setMenuOpen] = useState(false);
  const [tab, setTab] = useState<RailTab>("chapters");
  const [panelIndex, setPanelIndex] = useState(0);
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);
  const [pinnedBlockId, setPinnedBlockId] = useState<string | null>(null);
  const [showBoxes, setShowBoxes] = useState(false);
  const [numberDraft, setNumberDraft] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Chapter | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>(null);
  const [uploadErrors, setUploadErrors] = useState<
    Array<{ file: File; message: string }>
  >([]);
  const [storageFull, setStorageFull] = useState(false);
  const noticeTimer = useRef<number | null>(null);

  const notify = useCallback((tone: Notice["tone"], text: string) => {
    setNotice({ tone, text });
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4800);
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    };
  }, []);

  useEffect(() => {
    if (authReady && !user) router.replace("/login");
  }, [authReady, user, router]);

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PREFS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { showBoxes?: boolean };
      if (parsed.showBoxes === true) setShowBoxes(true);
    } catch {
      // A corrupt preference is not worth a warning.
    }
  }, []);

  const chapter = chapterState?.chapters.find((entry) => entry.id === chapterId);
  const series = chapter
    ? seriesState?.series.find(
        (entry) => entry.id === chapter.seriesId && !entry.archived
      )
    : undefined;
  const group = series
    ? groupsState?.groups.find((entry) => entry.id === series.groupId)
    : undefined;
  const member =
    group && user
      ? groupsState?.members.find(
          (entry) =>
            entry.groupId === group.id && entry.username === user.username
        )
      : undefined;
  const assigned =
    series && user
      ? Boolean(
          seriesState?.assignments.some(
            (entry) =>
              entry.seriesId === series.id && entry.username === user.username
          )
        )
      : false;

  const seriesChapters = useMemo(() => {
    if (!chapterState || !series) return [];
    return chapterState.chapters
      .filter((entry) => entry.seriesId === series.id)
      .sort((a, b) => a.number - b.number);
  }, [chapterState, series]);

  const panels = useMemo(() => {
    if (!chapterState || !chapter) return [];
    return chapterState.panels
      .filter((entry) => entry.chapterId === chapter.id)
      .sort((a, b) => a.index - b.index);
  }, [chapterState, chapter]);

  const currentPanel = panels[panelIndex] ?? null;

  const blocks = useMemo(() => {
    if (!chapterState || !currentPanel) return [];
    return chapterState.blocks
      .filter((entry) => entry.panelId === currentPanel.id)
      .sort((a, b) => a.index - b.index);
  }, [chapterState, currentPanel]);

  const terms = useMemo<GlossaryTerm[]>(() => {
    if (!glossaryState || !series) return [];
    return activeGlossaryTerms(series.id);
  }, [glossaryState, series]);

  useEffect(() => {
    setPanelIndex((index) =>
      Math.min(index, Math.max(0, panels.length - 1))
    );
  }, [panels.length]);

  useEffect(() => {
    setPanelIndex(0);
    setPinnedBlockId(null);
    setTab("chapters");
  }, [chapterId]);

  useEffect(() => {
    if (!chapter) return;
    setNumberDraft(String(chapter.number));
    setTitleDraft(chapter.title ?? "");
  }, [chapter?.id, chapter?.number, chapter?.title]);

  useEffect(() => {
    if (!pinnedBlockId) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".ch-bubble")) return;
      setPinnedBlockId(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPinnedBlockId(null);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [pinnedBlockId]);

  const goPrevPanel = useCallback(() => {
    setPanelIndex((index) => Math.max(0, index - 1));
  }, []);

  const goNextPanel = useCallback(() => {
    setPanelIndex((index) => Math.min(panels.length - 1, index + 1));
  }, [panels.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "[") {
        event.preventDefault();
        goPrevPanel();
      }
      if (event.key === "]") {
        event.preventDefault();
        goNextPanel();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [goPrevPanel, goNextPanel]);

  const loading =
    !authReady ||
    !groupsReady ||
    !seriesReady ||
    !chaptersReady ||
    !glossaryReady ||
    !groupsState ||
    !seriesState ||
    !chapterState ||
    !glossaryState ||
    !user;

  if (loading) return <WorkspaceLoading />;

  const allowed =
    Boolean(chapter && series && group && member) &&
    (member?.role !== "staff" || assigned);

  if (!allowed || !chapter || !series || !group || !member) {
    const accessDenied = Boolean(chapter && series && group && member);

    return (
      <div className="dash-shell">
        <DashboardRail
          user={user}
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          onSignOut={() => {
            signOut();
            router.replace("/login");
          }}
          links={workspaceLinks()}
          active="groups"
        />
        <div className="dash-body">
          <DashboardTopbar
            onOpenMenu={() => setMenuOpen(true)}
            trail={[{ label: "Workspace" }, { label: "Chapter" }]}
          />
          <main className="dash-main" id="main">
            <div className="ch-notfound">
              <p className="eyebrow">Chapter</p>
              <h1 className="ch-notfound-title">
                {accessDenied ? "No access to this chapter" : "Chapter not found"}
              </h1>
              <p className="ch-notfound-copy">
                {accessDenied
                  ? "You don't have access to this chapter. Ask a Manager or Owner to assign you to this series."
                  : "This link may be stale, it was removed from this browser, or you don't have access to it."}
              </p>
              <Link href="/groups" className="btn btn-ghost btn-sm">
                <ArrowLeft className="h-4 w-4" />
                Back to your groups
              </Link>
            </div>
          </main>
        </div>
      </div>
    );
  }

  const canEdit = canEditChapter(member.role, assigned);
  const canManage = canManageSeries(member.role);
  const run = activeRunChapterId() === chapter.id ? live : IDLE_RUN;
  const activeBlockId = hoveredBlockId ?? pinnedBlockId;

  const status = chapter.status;
  const canSubmit = canEdit && (status === "ready" || status === "rejected");
  const canApprove = canManage && status === "submitted";
  const canReopen = canManage && status === "approved";
  const canMarkReady =
    canEdit && status === "processing" && !run.running;

  const panelsWithText = panels.some((panel) =>
    chapterState.blocks.some(
      (block) =>
        block.panelId === panel.id && block.finalText.trim().length > 0
    )
  );

  let canRunReason: string | null = null;
  if (!canEdit) canRunReason = "You don't have access to run this chapter.";
  else if (panels.length === 0) canRunReason = "Upload a panel first.";
  else if (status === "submitted")
    canRunReason = "This chapter is awaiting review.";
  else if (status === "approved")
    canRunReason = "Reopen this chapter before running it again.";

  const canRun = canRunReason === null && !run.running;

  const runStageHint = run.running
    ? run.stage === "extract"
      ? "Extracting…"
      : run.stage === "translate"
        ? "Translating…"
        : run.stage === "proofread"
          ? "Proofreading…"
          : null
    : null;

  const trail = [
    { label: "Workspace" },
    { label: "Groups", href: "/groups" },
    { label: group.name, href: `/groups/${group.id}` },
    { label: series.title, href: `/series/${series.id}` },
    { label: `Chapter ${chapter.number}` },
  ];

  const handleSignOut = () => {
    signOut();
    router.replace("/login");
  };

  const writeStatus = (next: ChapterStatus, note?: string) => {
    try {
      setChapterStatus({
        chapterId: chapter.id,
        next,
        note: note ?? null,
        actor: user.username,
      });
      if (next === "submitted") notify("success", "Chapter submitted for review.");
      if (next === "approved") notify("success", "Chapter approved.");
      if (next === "rejected") notify("success", "Chapter sent back.");
      if (next === "ready") notify("success", "Chapter marked ready.");
    } catch (error) {
      notify(
        "error",
        error instanceof ChapterError
          ? error.message
          : "Something went wrong. Try again."
      );
    }
  };

  const handleRun = async () => {
    try {
      await startRun(chapter.id, user.username);
    } catch (error) {
      notify(
        "error",
        error instanceof ChapterError
          ? error.message
          : "Couldn't start the run."
      );
    }
  };

  const handleRetry = async () => {
    try {
      await retryFailed(chapter.id, user.username);
    } catch (error) {
      notify(
        "error",
        error instanceof ChapterError
          ? error.message
          : "Couldn't retry the run."
      );
    }
  };

  const handleUpload = async (files: File[]) => {
    if (uploadBusy || files.length === 0) return;
    setUploadBusy(true);
    setUploadErrors([]);

    const prepared: Array<{
      blob: Blob;
      width: number;
      height: number;
      byteSize: number;
    }> = [];
    const failures: Array<{ file: File; message: string }> = [];

    for (let index = 0; index < files.length; index += 1) {
      setUploadProgress({ current: index, total: files.length });
      try {
        prepared.push(await compressPanel(files[index]));
      } catch (error) {
        failures.push({
          file: files[index],
          message:
            error instanceof PanelImageError
              ? error.message
              : "We couldn't read that image.",
        });
      }
    }
    setUploadProgress(null);

    if (prepared.length > 0) {
      try {
        await addPreparedPanels(prepared);
        setStorageFull(false);
      } catch (error) {
        if (error instanceof ChapterError && error.code === "storage") {
          setStorageFull(true);
        }
        notify(
          "error",
          error instanceof ChapterError
            ? error.message
            : "Couldn't save those panels."
        );
      }
    }

    setUploadBusy(false);
    if (failures.length > 0) setUploadErrors(failures);
  };

  const addPreparedPanels = async (
    prepared: Array<{
      blob: Blob;
      width: number;
      height: number;
      byteSize: number;
    }>
  ) => {
    await addPanels({
      chapterId: chapter.id,
      actor: user.username,
      panels: prepared,
    });
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    try {
      const panelIds = deleteChapter({
        chapterId: deleteTarget.id,
        actor: user.username,
      });
      void deleteChapterImages(panelIds);
      const remaining = seriesChapters.filter(
        (entry) => entry.id !== deleteTarget.id
      );
      notify("success", `Chapter ${deleteTarget.number} was deleted.`);
      const wasOpen = deleteTarget.id === chapter.id;
      setDeleteTarget(null);
      if (wasOpen) {
        const next =
          remaining.find((entry) => entry.number > chapter.number) ??
          remaining[remaining.length - 1];
        router.replace(
          next ? `/chapters/${next.id}/workspace` : `/series/${series.id}`
        );
      }
    } catch (error) {
      setDeleteTarget(null);
      notify(
        "error",
        error instanceof ChapterError
          ? error.message
          : "Couldn't delete that chapter."
      );
    }
  };

  const commitNumber = () => {
    const parsed = Number(numberDraft);
    if (!Number.isFinite(parsed) || parsed === chapter.number) {
      setNumberDraft(String(chapter.number));
      setHeaderError(null);
      return;
    }
    try {
      updateChapterDetails({
        chapterId: chapter.id,
        number: parsed,
        actor: user.username,
      });
      setHeaderError(null);
    } catch (error) {
      setHeaderError(
        error instanceof ChapterError
          ? error.message
          : "Couldn't change the number."
      );
      setNumberDraft(String(chapter.number));
    }
  };

  const commitTitle = () => {
    const next = titleDraft.trim();
    if ((next || null) === chapter.title) return;
    try {
      updateChapterDetails({
        chapterId: chapter.id,
        title: next || null,
        actor: user.username,
      });
      setHeaderError(null);
    } catch (error) {
      setHeaderError(
        error instanceof ChapterError ? error.message : "Couldn't save the title."
      );
      setTitleDraft(chapter.title ?? "");
    }
  };

  const saveBlock = (blockId: string, text: string) => {
    try {
      updateBlockText({
        blockId,
        finalText: text,
        actor: user.username,
      });
    } catch (error) {
      notify(
        "error",
        error instanceof ChapterError
          ? error.message
          : "Couldn't save that line."
      );
    }
  };

  return (
    <div className="dash-shell ws-shell" data-workspace="true">
      <DashboardRail
        user={user}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onSignOut={handleSignOut}
        links={workspaceLinks()}
        active="groups"
        collapsed
      />

      <div className="dash-body">
        <DashboardTopbar
          onOpenMenu={() => setMenuOpen(true)}
          trail={trail}
        />

        <main className="dash-main ws-main" id="main">
          <div className="ch-mobile-notice">
            <p className="eyebrow">Workspace</p>
            <h1 className="ch-mobile-title">Best viewed on desktop</h1>
            <p className="ch-mobile-copy">
              The translation workspace needs three columns — chapters and
              glossary, English text, raw panels. Open it on a wider screen to
              edit this chapter.
            </p>
            <Link href={`/series/${series.id}`} className="btn btn-ghost btn-sm">
              <ArrowLeft className="h-4 w-4" />
              Back to {series.title}
            </Link>
          </div>

          <div className="ws-grid">
            <aside className="ws-rail">
              <ChapterRail
                chapters={seriesChapters}
                currentChapterId={chapter.id}
                canDelete={canManage}
                onDelete={(target) => setDeleteTarget(target)}
                tab={tab}
                onTabChange={setTab}
                glossaryCount={terms.length}
                glossary={
                  <GlossaryPanel
                    seriesId={series.id}
                    terms={terms}
                    canEdit={canEdit}
                    actor={user.username}
                    onNotice={notify}
                  />
                }
              />
            </aside>

            <section className="ws-center">
              {storageFull ? (
                <p className="ch-storage-banner" role="alert">
                  <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  This browser is out of storage. Delete a chapter or clear old
                  panels.
                </p>
              ) : null}

              <div className="ch-header">
                <div className="ch-header-main">
                  <div className="ch-header-fields">
                    <label className="ch-number-field">
                      <span className="ch-sr-only">Chapter number</span>
                      <span className="ch-number-prefix" aria-hidden="true">
                        Chapter
                      </span>
                      <input
                        className="ch-number-input"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        value={numberDraft}
                        disabled={!canEdit}
                        onChange={(event) => setNumberDraft(event.target.value)}
                        onBlur={commitNumber}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            event.currentTarget.blur();
                          }
                        }}
                      />
                    </label>

                    <input
                      className="ch-title-input"
                      value={titleDraft}
                      disabled={!canEdit}
                      maxLength={80}
                      placeholder="Untitled chapter"
                      aria-label="Chapter title"
                      onChange={(event) => setTitleDraft(event.target.value)}
                      onBlur={commitTitle}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                      }}
                    />

                    <ChapterStatusChip status={status} />
                  </div>

                  {headerError ? (
                    <p className="ch-header-error" role="alert">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {headerError}
                    </p>
                  ) : null}

                  {status === "rejected" && chapter.rejectionNote ? (
                    <p className="ch-rejection-note">
                      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      {chapter.rejectionNote}
                    </p>
                  ) : null}
                </div>

                <div className="ch-header-actions">
                  {canMarkReady ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => writeStatus("ready")}
                      title="Use this if a run was interrupted by a closed tab."
                    >
                      <Check className="h-3.5 w-3.5" />
                      Mark as ready
                    </button>
                  ) : null}

                  {canSubmit ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => writeStatus("submitted")}
                      disabled={!panelsWithText}
                      title={
                        panelsWithText
                          ? "Send this chapter to a Manager for review"
                          : "Translate at least one panel before submitting."
                      }
                    >
                      <Play className="h-3.5 w-3.5" />
                      Submit
                    </button>
                  ) : null}

                  {canApprove ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setRejectOpen(true)}
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => writeStatus("approved")}
                      >
                        <Stamp className="h-3.5 w-3.5" />
                        Approve
                      </button>
                    </>
                  ) : null}

                  {canReopen ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => writeStatus("submitted")}
                      title="Move this chapter back into review"
                    >
                      <Clock className="h-3.5 w-3.5" />
                      Reopen
                    </button>
                  ) : null}
                </div>
              </div>

              {uploadErrors.length > 0 ? (
                <div className="ch-upload-errors" role="alert">
                  {uploadErrors.map((failure) => (
                    <div className="ch-upload-error" key={failure.file.name}>
                      <span>
                        <strong>{failure.file.name}</strong> — {failure.message}
                      </span>
                      <button
                        type="button"
                        className="ch-upload-retry"
                        onClick={() => handleUpload([failure.file])}
                      >
                        Retry
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              <BlockEditor
                panel={currentPanel}
                panelIndex={panelIndex}
                panelCount={panels.length}
                blocks={blocks}
                editable={canEdit}
                activeBlockId={activeBlockId}
                onActiveBlock={setHoveredBlockId}
                onPinBlock={(blockId) =>
                  setPinnedBlockId((current) =>
                    current === blockId ? null : blockId
                  )
                }
                onSaveBlock={saveBlock}
                onPrev={goPrevPanel}
                onNext={goNextPanel}
                running={run.running}
                stageHint={runStageHint}
                hasPanels={panels.length > 0}
                panelState={
                  currentPanel ? run.panels[currentPanel.id] : undefined
                }
                onRetry={handleRetry}
              />
            </section>

            <aside className="ws-viewer">
              <PanelViewer
                panel={currentPanel}
                panelIndex={panelIndex}
                panelCount={panels.length}
                blocks={blocks}
                activeBlockId={activeBlockId}
                run={run}
                canRun={canRun}
                canRunReason={canRunReason}
                onRun={handleRun}
                onCancel={cancelRun}
                onRetry={handleRetry}
                onUpload={handleUpload}
                uploadBusy={uploadBusy}
                uploadProgress={uploadProgress}
                showBoxes={showBoxes}
                onToggleBoxes={(next) => {
                  setShowBoxes(next);
                  try {
                    window.localStorage.setItem(
                      PREFS_KEY,
                      JSON.stringify({ showBoxes: next })
                    );
                  } catch {
                    // Preferences are a nicety; ignore a full quota.
                  }
                }}
                onPrevPanel={goPrevPanel}
                onNextPanel={goNextPanel}
              />
            </aside>
          </div>
        </main>
      </div>

      {deleteTarget ? (
        <DeleteChapterDialog
          chapter={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleConfirmDelete}
        />
      ) : null}

      {rejectOpen ? (
        <RejectChapterDialog
          chapter={chapter}
          onClose={() => setRejectOpen(false)}
          onReject={(note) => {
            writeStatus("rejected", note);
            setRejectOpen(false);
          }}
        />
      ) : null}

      {notice ? (
        <div className="ch-notice" data-tone={notice.tone} role="status">
          {notice.tone === "success" ? (
            <Check className="h-4 w-4" aria-hidden="true" />
          ) : (
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
          )}
          <span>{notice.text}</span>
        </div>
      ) : null}
    </div>
  );
}
