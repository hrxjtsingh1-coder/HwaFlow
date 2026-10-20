<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project docs

- `docs/ARCHITECTURE.md` — single source of truth for architecture, data model, RBAC, design system and page inventory. Read before building anything.
- `docs/GROUPS-PAGE.md` — locked decisions, permissions, data model and build spec for the groups surfaces (`/admin/groups`, `/admin/groups/[id]`, `/settings/members`). Read before starting that work; do not re-ask the decisions recorded there.
- `docs/context.md` — product intent.

