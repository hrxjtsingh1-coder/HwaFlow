"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { signOut } from "@/lib/auth";
import { titlePayload } from "@/lib/chapters-format";
import {
  canEditChapter,
  type Chapter,
  type ChapterStatus,
} from "@/lib/chapters";
import {
  createChapterAction,
  deleteChapterAction,
  registerPanelsAfterAction,
  removePanelAction,
  setChapterStatusAction,
  updateChapterDetailsAction,
} from "@/lib/chapter-actions";
import { preparePanel, PanelImageError } from "@/lib/panel-image";
import {
  limitUploadBatch,
  pageObjectName,
  PAGE_MIME_TYPE,
} from "@/lib/engine-limits";
import { canManageSeries } from "@/lib/series";
import type { WorkspaceBundle, WorkspacePanel } from "@/lib/server/chapters";
import type { AuthUser } from "@/lib/identity";
import { createClient } from "@/lib/supabase/client";
import { DashboardRail } from "../dashboard/dashboard-rail";
import { DashboardTopbar } from "../dashboard/dashboard-topbar";
import { workspaceLinks } from "../dashboard/workspace-nav";
import { Isolate } from "../error-boundary";
import { NotFoundState } from "../not-found-state";
import { AlertCircle, ArrowLeft, Check, Clock, Play, Stamp } from "../icons";
import { ChapterStudio } from "./chapter-studio";
import { ChapterRail, type RailTab } from "./chapter-rail";
import { ChapterStatusChip } from "./chapter-status-dot";
import { DeleteChapterDialog } from "./delete-chapter-dialog";
import { GlossaryPanel } from "./glossary-panel";
import type { UploadProgress } from "./panel-dropzone";
import { RejectChapterDialog } from "./reject-chapter-dialog";
import { Tooltip } from "../tooltip";

type Notice = { tone: "success" | "error"; text: string };

/**
 * The chapter workspace: a chapter/glossary rail, the studio that pairs the raw
 * page with its typeset result, and the chapter's review controls.
 */
type WorkspaceViewProps = {
  viewer: AuthUser;
  bundle: WorkspaceBundle | null;
};

export function WorkspaceView({ viewer, bundle }: WorkspaceViewProps) {
  const router = useRouter();
  const [chapter, setChapter] = useState<Chapter | null>(bundle?.chapter ?? null);
  const [seriesChapters, setSeriesChapters] = useState<Chapter[]>(
    bundle?.chapters ?? []
  );
  const [panels, setPanels] = useState<WorkspacePanel[]>(bundle?.panels ?? []);

  const [menuOpen, setMenuOpen] = useState(false);
  const [tab, setTab] = useState<RailTab>("chapters");
  const [panelIndex, setPanelIndex] = useState(0);
  const [numberDraft, setNumberDraft] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Chapter | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [creatingChapter, setCreatingChapter] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>(null);
  const [removingPanel, setRemovingPanel] = useState(false);
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

  const user = viewer;
  const series = bundle?.series ?? null;
  const group = bundle?.group ?? null;
  const member = bundle?.viewerMember ?? null;
  const assigned = bundle?.viewerRole === "staff";

  const terms = bundle?.glossary ?? [];

  useEffect(() => {
    setPanelIndex((index) =>
      Math.min(index, Math.max(0, panels.length - 1))
    );
  }, [panels.length]);

  useEffect(() => {
    setPanelIndex(0);
    setTab("chapters");
  }, [chapter?.id]);

  useEffect(() => {
    if (!chapter) return;
    setNumberDraft(String(chapter.number));
    setTitleDraft(chapter.title ?? "");
  }, [chapter?.id, chapter?.number, chapter?.title]);

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
              kicker="Not available"
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
  const canCreate = canManage || member.role === "staff";

  const status = chapter.status;
  const canSubmit = canEdit && (status === "ready" || status === "rejected");
  const canApprove = canManage && status === "submitted";
  const canReopen = canManage && status === "approved";
  const canMarkReady = canEdit && status === "processing";
  const canUpload = canEdit && status !== "submitted" && status !== "approved";

  // Submitting needs at least one saved line; the studio writes those in
  // automatically when a run finishes, so this is a read of server state.
  const panelsWithText = panels.some((panel) =>
    bundle.blocks.some(
      (block) =>
        block.panelId === panel.id && block.finalText.trim().length > 0
    )
  );

  let engineRunReason: string | null = null;
  if (!canEdit) engineRunReason = "You don't have access to run this chapter.";
  else if (panels.length === 0) engineRunReason = "Add a panel first.";
  else if (status === "submitted") engineRunReason = "This chapter is awaiting review.";
  else if (status === "approved") engineRunReason = "Reopen this chapter before running it again.";
  const canRunEngine = engineRunReason === null;

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
    // Optimistic: the chip flips on click, and flips back if the server says no.
    const previous = chapter;
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

    const result = await setChapterStatusAction({
      chapterId: chapter.id,
      next,
      note: note ?? null,
    });

    if (!result.ok) {
      setChapter(previous);
      notify("error", result.message);
      return;
    }

    if (next === "submitted") notify("success", "Chapter submitted for review.");
    if (next === "approved") notify("success", "Chapter approved.");
    if (next === "rejected") notify("success", "Chapter sent back.");
    if (next === "ready") notify("success", "Chapter marked ready.");
    router.refresh();
  };

  const handleUpload = async (files: File[], afterIndex: number) => {
    if (!canUpload || uploadBusy || files.length === 0) return;

    const existingBytes = panels.reduce((sum, panel) => sum + panel.byteSize, 0);
    const intake = limitUploadBatch(
      files.map((file) => ({ name: file.name, size: file.size })),
      { pages: panels.length, bytes: existingBytes }
    );
    let budgetWarning = intake.reason;
    const candidates = intake.acceptedIndexes.map((index) => files[index]);
    if (candidates.length === 0) {
      if (budgetWarning) notify("error", budgetWarning);
      return;
    }

    setUploadBusy(true);
    setUploadErrors([]);
    const prepared: Array<{
      file: File;
      blob: Blob;
      width: number;
      height: number;
      byteSize: number;
      mimeType: string;
      extension: string;
    }> = [];
    const failures: Array<{ file: File; message: string }> = [];

    try {
      for (let index = 0; index < candidates.length; index += 1) {
        const file = candidates[index];
        setUploadProgress({ current: index, total: candidates.length });
        try {
          const page = await preparePanel(file);
          prepared.push({ file, ...page });
        } catch (error) {
          failures.push({
            file,
            message:
              error instanceof PanelImageError
                ? error.message
                : "We couldn't read that image.",
          });
        }
      }

      // JPEG/WebP files become lossless PNGs at the same pixel dimensions. Check
      // the resulting PNG byte sizes too, before uploading anything to Storage.
      const preparedBudget = limitUploadBatch(
        prepared.map((page) => ({ name: page.file.name, size: page.byteSize })),
        { pages: panels.length, bytes: existingBytes }
      );
      if (preparedBudget.reason) {
        budgetWarning = [budgetWarning, preparedBudget.reason].filter(Boolean).join(" ");
      }
      const acceptedPrepared = new Set(preparedBudget.acceptedIndexes);
      prepared.forEach((page, index) => {
        if (!acceptedPrepared.has(index)) {
          failures.push({
            file: page.file,
            message: preparedBudget.reason ?? "That page is over the chapter upload limit.",
          });
        }
      });
      const pagesToUpload = prepared.filter((_page, index) => acceptedPrepared.has(index));

      if (pagesToUpload.length > 0) {
        const supabase = createClient();
        const uploadedPaths: string[] = [];
        const registered: Array<{
          id: string;
          path: string;
          width: number;
          height: number;
          byteSize: number;
        }> = [];

        for (const page of pagesToUpload) {
          const id = crypto.randomUUID();
          const path = `${group.id}/${chapter.id}/${pageObjectName(id)}`;
          const { error } = await supabase.storage.from("pages").upload(path, page.blob, {
            contentType: PAGE_MIME_TYPE,
            upsert: false,
          });

          if (error) {
            failures.push({ file: page.file, message: error.message });
            continue;
          }

          uploadedPaths.push(path);
          registered.push({
            id,
            path,
            width: page.width,
            height: page.height,
            byteSize: page.byteSize,
          });
        }

        if (registered.length > 0) {
          // The rows land directly behind the panel the user was looking at.
          const result = await registerPanelsAfterAction({
            chapterId: chapter.id,
            afterIndex,
            panels: registered,
          });

          if (!result.ok) {
            await supabase.storage.from("pages").remove(uploadedPaths);
            notify("error", result.message);
          } else {
            const added = result.data.registered;
            const detail = budgetWarning ? ` ${budgetWarning}` : "";
            notify(
              "success",
              `${added} page${added === 1 ? "" : "s"} added at full resolution.${detail}`
            );
            // Land on the first page that was just inserted, so the upload is
            // visible instead of hidden behind the panel the user started from.
            setPanelIndex(afterIndex < 0 ? 0 : afterIndex + 1);
            router.refresh();
          }
        } else if (budgetWarning) {
          notify("error", budgetWarning);
        }
      } else if (budgetWarning) {
        notify("error", budgetWarning);
      }
    } catch (error) {
      notify(
        "error",
        error instanceof Error ? error.message : "Couldn't upload those pages."
      );
    } finally {
      setUploadProgress(null);
      setUploadBusy(false);
      if (failures.length > 0) setUploadErrors(failures);
    }
  };

  const handleRemovePanel = async (panel: WorkspacePanel) => {
    if (!canUpload || removingPanel) return;
    setRemovingPanel(true);
    try {
      const result = await removePanelAction({
        chapterId: chapter.id,
        panelId: panel.id,
      });
      if (!result.ok) {
        notify("error", result.message);
        return;
      }
      setPanelIndex((index) => Math.max(0, Math.min(index, panels.length - 2)));
      router.refresh();
    } finally {
      setRemovingPanel(false);
    }
  };

  const handleCreateChapter = async () => {
    if (creatingChapter) return;
    setCreatingChapter(true);

    const result = await createChapterAction(series.id);
    if (!result.ok) {
      setCreatingChapter(false);
      notify("error", result.message);
      return;
    }

    router.push(`/chapters/${result.data.id}/workspace`);
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
            <h1 className="ch-mobile-title">Turn on Desktop mode</h1>
            <p className="ch-mobile-copy">
              This workspace pairs the chapter rail with a full-size split view of
              the raw and translated pages, so it needs a desktop-width screen. On
              a phone or tablet, turn on Desktop mode. On a computer, widen the
              window for side-by-side page review.
            </p>
            <ul className="ch-mobile-steps">
              <li>Chrome, Edge, Firefox: menu ⋮ → Desktop site</li>
              <li>Safari on iPhone or iPad: aA → Request Desktop Website</li>
            </ul>
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
                canCreate={canCreate}
                creating={creatingChapter}
                onCreate={() => void handleCreateChapter()}
                onDelete={(target) => setDeleteTarget(target)}
                tab={tab}
                onTabChange={setTab}
                glossaryCount={terms.length}
                glossary={
                  <Isolate label="The glossary">
                    <GlossaryPanel
                      seriesId={series.id}
                      terms={terms}
                      canEdit={canEdit}
                      onNotice={notify}
                    />
                  </Isolate>
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
                    <Tooltip label="Clear a chapter left in the legacy processing state before review.">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => writeStatus("ready")}
                      >
                        <Check className="h-3.5 w-3.5" />
                        Mark as ready
                      </button>
                    </Tooltip>
                  ) : null}

                  {canSubmit ? (
                    <Tooltip
                      label={
                        panelsWithText
                          ? "Send this chapter to a Manager for review"
                          : "Import or write at least one line before submitting."
                      }
                    >
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => writeStatus("submitted")}
                        disabled={!panelsWithText}
                      >
                        <Play className="h-3.5 w-3.5" />
                        Submit
                      </button>
                    </Tooltip>
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
                    <Tooltip label="Move this chapter back into review">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => writeStatus("submitted")}
                      >
                        <Clock className="h-3.5 w-3.5" />
                        Reopen
                      </button>
                    </Tooltip>
                  ) : null}
                </div>
              </div>

              <Isolate label="The chapter studio">
                <ChapterStudio
                  chapterId={chapter.id}
                  initialJobId={chapter.engineJobId ?? null}
                  panels={panels}
                  panelIndex={panelIndex}
                  onPanelChange={setPanelIndex}
                  canEdit={canEdit}
                  canUpload={canUpload}
                  canRun={canRunEngine}
                  canRunReason={engineRunReason}
                  uploadBusy={uploadBusy}
                  uploadProgress={uploadProgress}
                  onUpload={handleUpload}
                  onRemovePanel={(panel) => void handleRemovePanel(panel)}
                  removing={removingPanel}
                />
              </Isolate>

              {uploadErrors.length > 0 ? (
                <div className="ch-upload-errors" role="alert">
                  {uploadErrors.map((failure, index) => (
                    <div className="ch-upload-error" key={`${failure.file.name}-${index}`}>
                      <span>
                        <strong>{failure.file.name}</strong> — {failure.message}
                      </span>
                      <button
                        type="button"
                        className="ch-upload-retry"
                        onClick={() =>
                          handleUpload(
                            [failure.file],
                            panels.length === 0 ? -1 : panelIndex
                          )
                        }
                        disabled={!canUpload || uploadBusy}
                      >
                        Retry
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

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
