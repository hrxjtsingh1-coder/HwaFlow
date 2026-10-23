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
import { titlePayload } from "@/lib/chapters-format";
import {
  canEditChapter,
  ChapterError,
  type Chapter,
  type ChapterStatus,
  type IncomingBlock,
  type TextBlock,
} from "@/lib/chapters";
import {
  deleteChapterAction,
  registerPanelsAction,
  setChapterStatusAction,
  setPanelBlocksAction,
  updateBlockPipelineTextAction,
  updateBlockTextAction,
  updateChapterDetailsAction,
} from "@/lib/chapter-actions";
import { upsertAutoGlossaryTermsAction } from "@/lib/glossary-actions";
import { compressPanel, PanelImageError } from "@/lib/panel-image";
import {
  activeRunChapterId,
  cancelRun,
  retryFailed,
  startRun,
  type PipelineContext,
  type RunState,
} from "@/lib/pipeline";
import { canManageSeries } from "@/lib/series";
import type { WorkspaceBundle, WorkspacePanel } from "@/lib/server/chapters";
import type { AuthUser } from "@/lib/identity";
import { createClient } from "@/lib/supabase/client";
import { usePipeline } from "@/lib/use-pipeline";
import { DashboardRail } from "../dashboard/dashboard-rail";
import { DashboardTopbar } from "../dashboard/dashboard-topbar";
import { workspaceLinks } from "../dashboard/workspace-nav";
import { NotFoundState } from "../not-found-state";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Clock,
  Play,
  Stamp,
} from "../icons";
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

/**
 * The chapter workspace.
 *
 * Three columns behind the collapsed main rail: chapters + glossary on the
 * left, the translated text in the middle, the raw art on the right. The
 * pipeline is client-driven; this component is the only place that starts it.
 *
 * The initial snapshot comes from the server; local state mirrors it so edits
 * and a run's progressive text land without a full page refresh.
 */
type WorkspaceViewProps = {
  viewer: AuthUser;
  bundle: WorkspaceBundle | null;
};

export function WorkspaceView({ viewer, bundle }: WorkspaceViewProps) {
  const router = useRouter();
  const live = usePipeline();

  const [chapter, setChapter] = useState<Chapter | null>(bundle?.chapter ?? null);
  const [seriesChapters, setSeriesChapters] = useState<Chapter[]>(
    bundle?.chapters ?? []
  );
  const [panels, setPanels] = useState<WorkspacePanel[]>(bundle?.panels ?? []);
  const [allBlocks, setAllBlocks] = useState<TextBlock[]>(
    bundle?.blocks ?? []
  );

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
    setChapter(bundle?.chapter ?? null);
    setSeriesChapters(bundle?.chapters ?? []);
    setPanels(bundle?.panels ?? []);
    setAllBlocks(bundle?.blocks ?? []);
  }, [bundle]);

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

  const user = viewer;
  const series = bundle?.series ?? null;
  const group = bundle?.group ?? null;
  const member = bundle?.viewerMember ?? null;
  const assigned = bundle?.viewerRole === "staff";

  const currentPanel = panels[panelIndex] ?? null;

  const blocks = useMemo(() => {
    if (!currentPanel) return [];
    return allBlocks
      .filter((entry) => entry.panelId === currentPanel.id)
      .sort((a, b) => a.index - b.index);
  }, [allBlocks, currentPanel]);

  const terms = bundle?.glossary ?? [];

  useEffect(() => {
    setPanelIndex((index) =>
      Math.min(index, Math.max(0, panels.length - 1))
    );
  }, [panels.length]);

  useEffect(() => {
    setPanelIndex(0);
    setPinnedBlockId(null);
    setTab("chapters");
  }, [chapter?.id]);

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

  if (!bundle || !chapter || !series || !group || !member) {
    return (
      <div className="dash-shell">
        <DashboardRail
          user={user}
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          onSignOut={() => {
            void signOut();
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
            <NotFoundState
              title="Chapter not found"
              copy="This link may be stale, or you don't have access to it. Ask a Manager or Owner to assign you to the series."
              href="/groups"
              action="Back to your groups"
              secondaryHref="/dashboard"
              secondaryAction="Dashboard"
            />
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
    allBlocks.some(
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
    void signOut();
  };

  const writeStatus = async (next: ChapterStatus, note?: string) => {
    const result = await setChapterStatusAction({
      chapterId: chapter.id,
      next,
      note: note ?? null,
    });

    if (!result.ok) {
      notify("error", result.message);
      return;
    }

    setChapter((current) =>
      current
        ? {
            ...current,
            status: next,
            rejectionNote:
              next === "rejected"
                ? note ?? null
                : next === "submitted"
                  ? null
                  : current.rejectionNote,
          }
        : current
    );

    if (next === "submitted") notify("success", "Chapter submitted for review.");
    if (next === "approved") notify("success", "Chapter approved.");
    if (next === "rejected") notify("success", "Chapter sent back.");
    if (next === "ready") notify("success", "Chapter marked ready.");
    router.refresh();
  };

  const pipelineContext = (): PipelineContext => ({
    chapter,
    panels,
    blocks: allBlocks,
    series: {
      title: series.title,
      description: null,
      language: series.language,
    },
    glossary: terms.map((term) => ({
      sourceTerm: term.sourceTerm,
      targetTerm: term.targetTerm,
      category: term.category,
    })),
    readPanelImage: async (panelId) => {
      const panel = panels.find((entry) => entry.id === panelId);
      if (!panel?.imageUrl) return null;
      try {
        const response = await fetch(panel.imageUrl);
        return response.ok ? await response.blob() : null;
      } catch {
        return null;
      }
    },
    setPanelBlocks: async (panelId, incoming) => {
      const result = await setPanelBlocksAction({
        chapterId: chapter.id,
        panelId,
        blocks: incoming,
      });
      if (!result.ok)
        throw new ChapterError(
          result.code === "signed-out" ? "forbidden" : result.code,
          result.message
        );
      setAllBlocks((current) => [
        ...current.filter((block) => block.panelId !== panelId),
        ...result.data,
      ]);
      return result.data;
    },
    updateBlockPipelineText: async (updates) => {
      const result = await updateBlockPipelineTextAction({
        chapterId: chapter.id,
        updates,
      });
      if (!result.ok)
        throw new ChapterError(
          result.code === "signed-out" ? "forbidden" : result.code,
          result.message
        );

      const byId = new Map(updates.map((update) => [update.blockId, update]));
      setAllBlocks((current) =>
        current.map((block) => {
          const update = byId.get(block.id);
          if (!update) return block;
          return {
            ...block,
            baseTranslation: update.baseTranslation ?? block.baseTranslation,
            finalText: update.finalText ?? block.finalText,
          };
        })
      );
    },
    setChapterStatus: async (next, note) => {
      const result = await setChapterStatusAction({
        chapterId: chapter.id,
        next,
        note: note ?? null,
      });
      if (!result.ok)
        throw new ChapterError(
          result.code === "signed-out" ? "forbidden" : result.code,
          result.message
        );
      setChapter((current) =>
        current ? { ...current, status: next } : current
      );
    },
    upsertAutoTerms: async (detected) => {
      await upsertAutoGlossaryTermsAction({
        seriesId: series.id,
        chapterId: chapter.id,
        terms: detected,
      });
    },
    onBlocks: (panelId, updated) => {
      setAllBlocks((current) => [
        ...current.filter((block) => block.panelId !== panelId),
        ...updated,
      ]);
    },
  });

  const handleRun = async () => {
    try {
      await startRun(pipelineContext());
      router.refresh();
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
      await retryFailed(pipelineContext());
      router.refresh();
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
      file: File;
      blob: Blob;
      width: number;
      height: number;
      byteSize: number;
    }> = [];
    const failures: Array<{ file: File; message: string }> = [];

    for (let index = 0; index < files.length; index += 1) {
      setUploadProgress({ current: index, total: files.length });
      try {
        const compressed = await compressPanel(files[index]);
        prepared.push({ file: files[index], ...compressed });
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
      const supabase = createClient();
      const uploadedPaths: string[] = [];
      const registered: Array<{
        id: string;
        index: number;
        path: string;
        width: number;
        height: number;
        byteSize: number;
      }> = [];

      let nextIndex = panels.length;

      for (const panel of prepared) {
        const id = crypto.randomUUID();
        const path = `${group.id}/${chapter.id}/${id}.webp`;
        const { error } = await supabase.storage
          .from("pages")
          .upload(path, panel.blob, {
            contentType: "image/webp",
            upsert: false,
          });

        if (error) {
          failures.push({ file: panel.file, message: error.message });
          continue;
        }

        uploadedPaths.push(path);
        registered.push({
          id,
          index: nextIndex,
          path,
          width: panel.width,
          height: panel.height,
          byteSize: panel.byteSize,
        });
        nextIndex += 1;
      }

      if (registered.length > 0) {
        const result = await registerPanelsAction({
          chapterId: chapter.id,
          panels: registered,
        });

        if (!result.ok) {
          await supabase.storage.from("pages").remove(uploadedPaths);
          notify("error", result.message);
        } else {
          notify(
            "success",
            `${registered.length} panel${registered.length === 1 ? "" : "s"} added.`
          );
          router.refresh();
        }
      }
    }

    setUploadBusy(false);
    if (failures.length > 0) setUploadErrors(failures);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;

    const result = await deleteChapterAction({ chapterId: target.id });
    setDeleteTarget(null);

    if (!result.ok) {
      notify("error", result.message);
      return;
    }

    notify("success", `Chapter ${target.number} was deleted.`);

    if (target.id === chapter.id) {
      const remaining = seriesChapters.filter(
        (entry) => entry.id !== target.id
      );
      const next =
        remaining.find((entry) => entry.number > chapter.number) ??
        remaining[remaining.length - 1];
      router.replace(
        next ? `/chapters/${next.id}/workspace` : `/series/${series.id}`
      );
    } else {
      setSeriesChapters((current) =>
        current.filter((entry) => entry.id !== target.id)
      );
    }
  };

  const commitNumber = async () => {
    const parsed = Number(numberDraft);
    if (!Number.isFinite(parsed) || parsed === chapter.number) {
      setNumberDraft(String(chapter.number));
      setHeaderError(null);
      return;
    }

    const result = await updateChapterDetailsAction({
      chapterId: chapter.id,
      number: parsed,
    });

    if (!result.ok) {
      setHeaderError(result.message);
      setNumberDraft(String(chapter.number));
      return;
    }

    setHeaderError(null);
    setChapter((current) =>
      current ? { ...current, number: result.data.number } : current
    );
    setSeriesChapters((current) =>
      current
        .map((entry) =>
          entry.id === chapter.id
            ? { ...entry, number: result.data.number }
            : entry
        )
        .sort((a, b) => a.number - b.number)
    );
    setNumberDraft(String(result.data.number));
  };

  const commitTitle = async () => {
    const next = titlePayload(titleDraft);
    if (next === (chapter.title ?? "")) return;

    const result = await updateChapterDetailsAction({
      chapterId: chapter.id,
      // Empty string clears the title; null would mean "leave unchanged".
      title: next,
    });

    if (!result.ok) {
      setHeaderError(result.message);
      setTitleDraft(chapter.title ?? "");
      return;
    }

    setHeaderError(null);
    setChapter((current) =>
      current ? { ...current, title: result.data.title } : current
    );
    setSeriesChapters((current) =>
      current.map((entry) =>
        entry.id === chapter.id
          ? { ...entry, title: result.data.title }
          : entry
      )
    );
  };

  const saveBlock = async (blockId: string, text: string) => {
    const result = await updateBlockTextAction({
      blockId,
      finalText: text,
    });

    if (!result.ok) {
      notify("error", result.message);
      return false;
    }

    setAllBlocks((current) =>
      current.map((block) =>
        block.id === blockId
          ? {
              ...block,
              finalText: result.data.finalText,
              isEdited: true,
            }
          : block
      )
    );

    return true;
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
                    onNotice={notify}
                  />
                }
              />
            </aside>

            <section className="ws-center">
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
