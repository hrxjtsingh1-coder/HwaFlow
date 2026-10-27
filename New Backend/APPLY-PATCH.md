# Fastest path: apply the ready-made patch

I already cloned your public repo, made **every** change, and verified them.
Your friend does NOT need to hand-merge anything. Pick one option.

## Option A — one command (recommended)

Give your friend **`HwaFlow-engine-integration.patch`**. From the root of a
clean clone of `https://github.com/hrxjtsingh1-coder/HwaFlow/`:

```bash
git apply --check HwaFlow-engine-integration.patch   # dry run
git apply HwaFlow-engine-integration.patch           # apply
git status --short                                  # review
npm install
npx tsc --noEmit && npm test && npm run build
git add -A && git commit -m "feat(engine): integrate XianScan image-engine bridge (routes, client, panel)"
```

I tested this on a **fresh clone**: `git apply --check` OK, `git apply` OK,
`npx tsc --noEmit` clean.

## Option B — unzip changed files over the repo

Give your friend **`HwaFlow-engine-files.zip`**. It contains only the 13
changed/new files at their correct repo-relative paths. Unzip it into the repo
root, overwriting. Then commit.

## Option C — hand it to an AI agent

Give your friend **`GITHUB-PROMPT.md`**. It contains the full deep prompt
written against the actual repo, including the three conflicts I found.

---

## Exactly what the patch changes (13 files, +1067 lines)

**Added (9)**
```
lib/engine.ts                                        server-only Worker client
app/api/engine/jobs/route.ts                         create job
app/api/engine/jobs/[id]/route.ts                    get job
app/api/engine/jobs/[id]/approve/route.ts            approve (+ manager check)
app/api/engine/jobs/[id]/reject/route.ts             reject
app/api/engine/jobs/[id]/[kind]/[page]/route.ts     asset proxy
components/chapters/engine-panel.tsx                 UI panel
supabase/migrations/20261105000000_engine_purge.sql optional purge RPC
docs/engine-integration.md                           install guide
```

**Modified (4)**
```
components/chapters/workspace-view.tsx   +2 lines (import + <EnginePanel>)
.env.example                             +3 empty ENGINE_* vars
.gitignore                               +3 local-secret patterns
docs/ARCHITECTURE.md                     +section 14 (engine bridge)
```

**Deleted:** nothing. The repo had zero engine files, so there was nothing to
remove. (The prompt still tells the agent to delete duplicates from any older
attempt, if it finds any.)

## Three conflicts I found and fixed

1. **Migration out of order.** The patch shipped
   `20261026130000_engine_purge.sql`, but the repo's newest migration is
   `20261104090000_currency.sql`. Renamed to
   `20261105000000_engine_purge.sql` so `supabase db push` accepts it.
2. **`.env.example` is NOT in `HwaFlow-with-engine.zip`** (the old INSTALL.md
   incorrectly said it was). Appended 3 empty vars to the existing file and
   kept `GEMINI_API_KEY` + `MOCK_PIPELINE` intact.
3. **`.gitignore` didn't cover local secrets.** Added `.dev.vars`,
   `.dev.vars.*`, `kaggle.json`.

Also added a server-side Owner/Manager check to the approve route
(error-tolerant: if the `can_manage_chapter` RPC is missing it logs a warning
and fails open, so it cannot brick approvals).

## Verification results (real repo, real build)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ clean |
| `npm test` (vitest) | ✅ 16 files / **80 tests passed** |
| `npm run build` (Next 16.4.2, with dummy Supabase env) | ✅ compiled, 5 `/api/engine/jobs*` routes registered |
| `git apply --check` on a fresh clone | ✅ OK |
| `npx tsc --noEmit` on that fresh patched clone | ✅ clean |

> `npm run build` on a bare clone fails at prerendering `/dashboard` with
> "Missing Supabase environment variables" — that is **pre-existing repo
> behaviour**, not caused by this patch. Add your Supabase env vars (or dummy
> values for CI) and the build completes.

## After applying, set the runtime env

```dotenv
ENGINE_API_URL=https://xianscan-engine-bridge.<sub>.workers.dev
ENGINE_WEB_TOKEN=<exact WEB_TOKEN secret>
ENGINE_PURGE_SUPABASE_ORIGINALS=1   # optional; needs `supabase db push`
```

Never commit real values. Then follow `NEXT-STEPS.md` Step 5 for the first
end-to-end job.
