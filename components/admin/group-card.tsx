"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { getInitials } from "@/lib/auth";
import type { Group, GroupMember } from "@/lib/groups";
import { ArrowUpRight, Check, Copy, Layers, MoreHorizontal, Users } from "../icons";
import { GroupAvatar } from "../group-avatar";

type GroupCardProps = {
  group: Group;
  owner: GroupMember | null;
  memberCount: number;
  seriesCount: number;
  justCreated?: boolean;
  index?: number;
  /**
   * The admin detail route is deferred until the data layer is complete.
   * Pass null to render a non-clickable card and hide "Open group".
   */
  detailHref?: string | null;
};

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const field = document.createElement("textarea");
      field.value = value;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(field);
      return ok;
    } catch {
      return false;
    }
  }
}

export function GroupCard({
  group,
  owner,
  memberCount,
  seriesCount,
  justCreated,
  index = 0,
  detailHref = `/admin/groups/${group.id}`,
}: GroupCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const copiedTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    return () => {
      if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
    };
  }, []);

  const handleCopy = async () => {
    const ok = await copyText(group.slug);
    if (!ok) return;
    setCopied(true);
    setMenuOpen(false);
    if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(false), 1800);
  };

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("[role='menuitem']")
    );
    if (items.length === 0) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = (current + step + items.length) % items.length;
    items[next].focus();
  };

  const ownerName = owner?.displayName ?? "No Owner assigned";
  const ownerHandle = owner ? `@${owner.username}` : "—";

  const cardBody = (
    <>
      <div className="admin-group-card-top">
        <GroupAvatar name={group.name} iconDataUrl={group.iconDataUrl} />
        <span className="chip admin-currency-chip">{group.currency}</span>
      </div>

      <h3 className="admin-group-name">{group.name}</h3>

      <div className="admin-group-owner">
        <span className="admin-avatar" aria-hidden="true">
          {getInitials(owner?.displayName ?? "", owner?.username ?? "")}
        </span>
        <span className="admin-group-owner-meta">
          <span className="admin-group-owner-name">{ownerName}</span>
          <span className="admin-group-owner-handle">{ownerHandle}</span>
        </span>
      </div>

      <div className="admin-group-counts">
        <span className="chip">
          <Users className="h-3 w-3" />
          {memberCount} member{memberCount === 1 ? "" : "s"}
        </span>
        <span className="chip">
          <Layers className="h-3 w-3" />
          {seriesCount} series
        </span>
      </div>
    </>
  );

  return (
    <article
      className="admin-group-card"
      data-new={justCreated ? "true" : "false"}
      style={{ "--admin-card-delay": `${Math.min(index, 8) * 45}ms` } as CSSProperties}
    >
      {detailHref ? (
        <Link
          href={detailHref}
          className="admin-group-card-link"
          aria-label={`Open ${group.name}`}
        >
          {cardBody}
        </Link>
      ) : (
        <div className="admin-group-card-link">{cardBody}</div>
      )}

      {justCreated ? (
        <span className="chip chip-mint admin-card-created">
          <Check className="h-3 w-3" />
          Created
        </span>
      ) : copied ? (
        <span className="chip chip-accent admin-card-created" aria-live="polite">
          <Check className="h-3 w-3" />
          Handle copied
        </span>
      ) : null}

      <div className="admin-card-actions" ref={menuRef}>
        <button
          ref={triggerRef}
          type="button"
          className="admin-icon-btn admin-card-menu-btn"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`Actions for ${group.name}`}
          onClick={() => setMenuOpen((value) => !value)}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>

        <div
          className="admin-menu"
          role="menu"
          data-open={menuOpen ? "true" : "false"}
          aria-label={`${group.name} actions`}
          onKeyDown={onMenuKeyDown}
        >
          {detailHref ? (
            <Link
              href={detailHref}
              className="admin-menu-item"
              role="menuitem"
              tabIndex={menuOpen ? 0 : -1}
              onClick={() => setMenuOpen(false)}
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
              Open group
            </Link>
          ) : null}
          <button
            type="button"
            className="admin-menu-item"
            role="menuitem"
            tabIndex={menuOpen ? 0 : -1}
            onClick={() => void handleCopy()}
          >
            <Copy className="h-3.5 w-3.5" />
            Copy handle
            <code className="admin-menu-code">{group.slug}</code>
          </button>
        </div>
      </div>
    </article>
  );
}
