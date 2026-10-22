# Groups page — build spec and decision record

> **Status:** decisions locked, not yet built.
> **Created:** 2026-10-21, from the groups-page discussion.
> **Read this first** when starting the groups work. It is self-contained: every
> choice below was confirmed by the user and should not be re-asked.
> **Supersedes:** the page-inventory entries #4, #5, #6 and #20 in
> `docs/ARCHITECTURE.md` where they differ.
> **Companions:** `docs/ARCHITECTURE.md` (architecture + data model),
> `docs/context.md` (product intent).

---

## 1. What this delivery is

Three surfaces, built together:

| Route | Purpose |
|---|---|
| `/admin/groups` | Platform admin console: card grid of every group, search, sort, create drawer |
| `/admin/groups/[id]` | Single-page group detail: metadata, stats, Owner card, read-only member table |
| `/settings/members` | Group-scoped member management: invites, role changes, removal, invite accept/decline |

Two navigation shells:

- **Admin shell** — separate from the workspace shell. Sidebar contains **Groups only**
  plus a "Back to workspace" link. Used by `/admin/groups*`.
- **Workspace shell** — the existing `dash-*` shell. Used by `/settings/members`.
  The admin-only account gets an extra "Admin console" nav entry here, otherwise
  `/admin/groups` would be unreachable by navigation.

**Group data is real and persisted** in `localStorage`. Auth (accounts and profiles) now
runs on Supabase, so an Owner is resolved through the `profile_lookup` RPC and must have a
registered account — not merely an account in this browser.

---

## 2. Locked decisions

| Area | Decision |
|---|---|
| Admin identity | Hardcoded username **`noddy`**, matched case-insensitively via `normalizeUsername()` (registration lowercases, so `Noddy` is stored as `noddy`) |
| Admin powers | Create groups, view any group's metadata, change Owner. **No** content access, **no** role edits below Owner |
| Admin gate | Non-admin at `/admin/*` sees a centered 403 panel ("Platform admin only" + their username + Back to dashboard). Signed-out visitors go to `/login` first |
| Group detail | Single page, no tabs: header, stats, Owner card, read-only member table, link to `/settings/members` |
| Create UX | Right-side drawer over the grid (not a route, not a centered modal) |
| Create fields | Group name, Owner username, optional group icon, currency (default USD) |
| Slug | Auto-derived from the name, shown read-only. Collision gets `-2`, `-3` |
| Name uniqueness | Group names may repeat; the slug is unique |
| Icon | Upload any image; downscale to 256x256 WebP; store as a data URL behind a swappable `uploadGroupIcon()` adapter |
| No icon | Deterministic monogram (first letter) + one of the four pastel accents derived from a name hash |
| Roles | Owner (one per group), Manager, Staff |
| Manager powers | Add **Staff only**, create series, assign Staff to series, approve/reject chapters |
| Role changes | Owner only. Owner cannot change their own role; the Owner seat moves only via Admin |
| Owner transfer | Admin picks a new Owner from existing members and chooses the outgoing role (Manager or Staff) |
| Invites | Pending row, no email. Invitee sees an Accept/Decline card on `/settings/members` |
| Invite roles | Owner may invite Staff or Manager; Manager may invite Staff only |
| Active group | **Last accepted invite wins.** No group switcher in this delivery |
| Members page | Full management for Owner/Manager. **Staff sees their own membership card only** |
| Groups list | Card grid (not a table). Search by group name. Sort by newest / most members / name A-Z |
| Group card | Icon, name, currency chip, Owner line with avatar, member + series chips, hover action menu. **No created date** |
| Admin shell nav | Groups only, plus Back to workspace |
| Persistence | localStorage, atomic single-key writes, cross-tab sync |

### Deliberately deferred

Group switcher for multi-group users · group delete/archive · `/admin` overview ·
`/admin/users` · `/settings/group` (currency/retention editing) · series-assignment UI
on the members page (show a read-only count) · retention policy controls · invite
expiry/notifications · audit ledger · Supabase RLS migration · real icon bucket.

---

## 3. Permissions matrix (this delivery)

| Action | Admin (`noddy`) | Owner | Manager | Staff |
|---|:--:|:--:|:--:|:--:|
| Open `/admin/groups` | yes | no | no | no |
| Create group | yes | no | no | no |
| View group metadata | yes | n/a | n/a | n/a |
| Change Owner | yes | no | no | no |
| Edit group name/currency | deferred | deferred | no | no |
| Invite Staff | no | yes | yes | no |
| Invite Manager | no | yes | no | no |
| Change roles | no | yes | no | no |
| Remove member | no | yes | no | no |
| Revoke a pending invite | no | any | only ones they sent | no |
| View full roster | no | yes | yes | no |
| View own membership | n/a | yes | yes | yes |
| Accept / decline an invite | yes | yes | yes | yes |

**Enforce in the store, not just the UI.** A manager calling `changeRole` must throw even
if a component accidentally renders the control.

---

## 4. Data model

Single localStorage key `hwaflow.groups.v1` holding one object, so every write is atomic.

```ts
type GroupRole = "owner" | "manager" | "staff";

type Group = {
  id: string;
  name: string;
  slug: string;              // unique, derived from name
  currency: string;          // ISO 4217, default "USD"
  iconDataUrl: string | null;
  createdBy: string;         // admin username
  createdAt: string;         // ISO
};

type GroupMember = {
  id: string;
  groupId: string;
  userId: string;            // AuthUser.id
  username: string;          // normalized
  displayName: string;       // snapshot; refresh from accounts on read
  role: GroupRole;
  invitedBy: string | null;  // username, null for the admin-created Owner
  joinedAt: string;
};

type GroupInvite = {
  id: string;
  groupId: string;
  username: string;          // normalized invitee
  role: "manager" | "staff"; // never "owner"
  status: "pending" | "accepted" | "revoked";
  invitedBy: string;         // username
  createdAt: string;
};

type GroupsState = {
  version: 1;
  groups: Group[];
  members: GroupMember[];
  invites: GroupInvite[];
  activeByUser: Record<string, string>; // username -> groupId
};
```

Notes:

- Decline is stored as `status: "revoked"` to stay inside the documented status set
  from ARCHITECTURE section 6 (`pending | accepted | revoked`). Do not add a fourth status.
- Shapes mirror `groups`, `group_members`, `group_invites` so the Supabase migration is
  mechanical. Add a comment block mapping each type to its future table.
- `activeByUser` is set on invite accept. Fallback when missing: newest `joinedAt`
  membership for that user.
- Currencies offered: USD (default), EUR, GBP, CAD, AUD, JPY, KRW.
- Icon data URL cap: reject output over 100 KB after compression.

### Store API (`lib/groups.ts`)

```ts
// reads
listGroups(): Group[]
getGroup(id: string): Group | null
getMembers(groupId: string): GroupMember[]
getMember(groupId: string, userId: string): GroupMember | null
getActiveGroupFor(username: string): { group: Group; member: GroupMember } | null
listInvitesForGroup(groupId: string): GroupInvite[]
listInvitesForUser(username: string): GroupInvite[]
seriesCountFor(groupId: string): number          // 0 until the series module exists

// writes (all validate + throw GroupError like AuthError)
createGroup(input): Group
inviteMember(input): GroupInvite
revokeInvite(inviteId: string, actor: string): void
acceptInvite(inviteId: string, username: string): void
declineInvite(inviteId: string, username: string): void
changeRole(input): void
removeMember(input): void
transferOwnership(input): void
setActiveGroup(username: string, groupId: string): void
```

Export the guard constants:

```ts
export const PLATFORM_ADMIN_USERNAME = "noddy";
export const GROUP_CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "KRW"];
export const ROLE_LABEL = { owner: "Owner", manager: "Manager", staff: "Staff" };
export function isPlatformAdmin(username?: string | null): boolean;
export function roleRank(role: GroupRole): number;      // owner 3, manager 2, staff 1
export function canManageMembers(role: GroupRole): boolean;  // owner + manager
export function canChangeRoles(role: GroupRole): boolean;    // owner only
```

Validation rules enforced in the store:

- `createGroup`: name 2–60 chars; currency in list; owner account exists; icon under cap.
- `inviteMember`: actor is Owner or Manager; Manager may only pass `role: "staff"`;
  invitee exists; not already a member; no duplicate pending invite.
- `acceptInvite`: invite is pending and the username matches the signed-in user.
- `changeRole`: actor is Owner; target is not the Owner; new role is manager or staff.
- `removeMember`: actor is Owner; target is not the Owner.
- `transferOwnership`: actor is the platform admin; new owner is a member of the group;
  outgoing role is manager or staff.

Add `lib/use-groups.ts` with a `useGroups()` hook that reads after mount (SSR-safe, like
`useAuthSession`) and subscribes to a `hwaflow:groups` custom event plus the `storage`
event so two tabs stay in sync.

### Required `lib/auth.ts` additions

```ts
export function findAccount(username: string): AuthUser | null;
export function listAccounts(): AuthUser[];
```

Both must return the public `AuthUser` shape only — never `StoredAccount`, which carries
`salt` and `hash`. Use these for Owner/existing-member validation and display-name
resolution.

---

## 5. Icon pipeline

`lib/group-icon.ts`:

```ts
export async function uploadGroupIcon(file: File): Promise<string>;
```

- Accept `image/*`, reject over 5 MB with a readable message.
- Decode with `createImageBitmap` (fallback to `Image` + object URL).
- Square cover-crop, draw to a 256x256 canvas.
- Export `image/webp` at quality 0.85. If the result is over 100 KB, retry once at 0.7.
- Return the `data:image/webp;base64,...` string.
- Leave a clearly marked comment: swap the body for a Supabase Storage upload
  (`group-icons` bucket) returning a public URL. Nothing else in the app should need
  to change, because consumers only read `group.iconDataUrl`.

`components/admin/group-icon-field.tsx` owns the UI: drop zone, file picker, preview,
remove button, monogram fallback preview, keyboard accessible.

---

## 6. `/admin/groups` — grid

Shell: admin shell. Page header: eyebrow "Platform", title "Groups", subline with the
group count, primary action "New group".

- Grid: `repeat(auto-fill, minmax(280px, 1fr))`, 3/2/1 columns.
- Card contents, top to bottom:
  - icon (or monogram) and currency chip
  - group name
  - Owner line: initials avatar, display name, `@username`
  - two chips: `N members`, `N series`
  - hover/focus action menu: **Open**, **Copy handle** (copies the group slug)
- **No created date on the card.**
- Toolbar: labeled search input filtering by group name (case-insensitive, trimmed) and
  a sort select (Newest / Most members / Name A-Z). "Newest" uses `createdAt` even though
  it is not displayed.
- Empty state: "No groups yet" + explanation that only the platform admin creates groups
  + "Create your first group" button.
- No-results state: keeps the search term visible, offers a clear-search button.
- Creating a group closes the drawer, keeps the grid, and animates the new card in at the
  top with a brief "Created" chip.

## 7. Create-group drawer

Right-side drawer, ~440 px, overlays with a dimmed backdrop, traps focus, closes on
Escape or backdrop click, restores focus to the trigger, locks body scroll.

Fields, in order:

1. **Group name** — required, 2–60 chars. Live slug preview underneath (read-only).
2. **Owner username** — required. Debounced lookup with three states:
   - found: "Found: {Display Name} (@username)"
   - not found: "No account with that username. They need to register first."
   - checking: subtle "Checking…"
3. **Group icon** — optional upload field (section 5), with monogram fallback.
4. **Currency** — select, USD default.

Footer: Cancel / Create group. Errors are inline, `aria-live="polite"`, first invalid
field focused on submit. Duplicate names are allowed; the slug disambiguates.

On submit, atomically create the group **and** the Owner's `GroupMember` row, set
`createdBy` to the admin, then close and show the new card.

## 8. `/admin/groups/[id]` — detail

Next 16: the server page receives `params: Promise<{ id: string }>` and must
`const { id } = await params` before rendering the client view. Unknown id renders a
friendly "Group not found" panel with a back link.

Content, in order:

1. **Header** — icon, name, slug, currency chip, created date (allowed here), and an
   "Open member settings" link to `/settings/members`.
2. **Stat row** — members, managers, series, chapters. Series/chapters are `0` until
   those modules exist; style them muted rather than faking numbers.
3. **Owner card** — avatar, display name, `@username`, "Owner since {date}", and a
   **Change Owner** button (admin only).
4. **Member table (read-only)** — avatar, display name, `@username`, role badge, series
   assigned, joined date. No action menus; the copy explains role changes live in
   member settings.
5. No danger zone: deleting or archiving groups is out of scope for v1.

**Change Owner dialog** — member picker limited to current members, outgoing-role radios
(Manager default, Staff option), confirm copy that states the demotion explicitly.
Disabled with a hint ("Add members before transferring ownership") when the group has
only the Owner. The transfer is one atomic write.

## 9. `/settings/members` — member management

Shell: workspace shell, Workspace nav with Settings active. Page resolves the active
group via `getActiveGroupFor(user.username)`.

Render order:

1. **Received invites** (always first, hidden when none): one card per pending invite —
   group icon + name, invited role, inviter, Accept / Decline. Accepting creates the
   membership and sets `activeByUser` (last accepted wins). Declining revokes it.
2. **No group state** — when the user has no active group and no invites: "You're not in
   a group yet. Ask an Owner to invite your username." With invites present, show only
   the invite cards plus this note.
3. **Group header** — icon, name, currency, and the viewer's role badge.
4. **Staff view** — only their own membership card: role, joined date, series assigned,
   plus a short explanation of what Staff can do. No roster, no invite button, no
   actions. Their received invites still appear above.
5. **Owner / Manager view** —
   - Primary action: "Invite member" (drawer).
   - **Pending invites** list: username, role, invited by, sent date, Revoke. Managers
     can only revoke invites they sent.
   - **Member table**: avatar, display name, `@username`, role badge, series assigned,
     joined date, actions.
     - Owner sees a role menu (Make manager / Make staff) and Remove on every non-Owner
       row. The Owner's own row has no actions.
     - Manager sees no row actions.
   - Remove uses a confirm dialog that names the person and states that their series
     assignments will be unassigned. Removal is immediate otherwise.

**Invite drawer** — username field with the same debounced account lookup as the create
form, plus a role control. Owner: Staff/Manager. Manager: locked to Staff with inline
copy "Managers can add Staff. Only the Owner promotes to Manager." Rejects existing
members and duplicate pending invites with specific errors.

---

## 10. Shared shell work

Do **not** move `/dashboard` into a route group. Generalize the existing shell instead:

- `components/dashboard/dashboard-rail.tsx` — take a `links` array and an `active` key
  instead of the hardcoded single Dashboard link. Add an admin-only "Admin console"
  entry when `isPlatformAdmin(user.username)`.
- `components/dashboard/dashboard-topbar.tsx` — take a breadcrumb trail instead of the
  hardcoded "Workspace / Overview".
- `components/dashboard/dashboard-home.tsx` — pass the new props; rendering and behavior
  stay identical.
- `app/settings/layout.tsx` — imports `../dashboard/dashboard.css` (global CSS imports
  from any layout are legal in Next 16) plus `./settings.css`, and renders nothing else.
- `app/admin/layout.tsx` — imports `./admin.css`; the shell component gates access
  client-side and renders the 403 panel.

Admin shell visual language: same tokens, narrower rail (~220 px), "Platform admin"
eyebrow, lavender-tinted active state, shield badge on the account, "Back to workspace"
in the rail footer, mobile drawer under 960 px. Topbar breadcrumb: `Admin / Groups` or
`Admin / Groups / {name}` (look the name up from the store on the client).

---

## 11. Files

**New**

```
lib/groups.ts
lib/use-groups.ts
lib/group-icon.ts
app/admin/layout.tsx
app/admin/admin.css
app/admin/groups/page.tsx
app/admin/groups/[id]/page.tsx
app/settings/layout.tsx
app/settings/settings.css
app/settings/members/page.tsx
components/admin/admin-shell.tsx
components/admin/forbidden.tsx
components/admin/groups-view.tsx
components/admin/group-card.tsx
components/admin/create-group-drawer.tsx
components/admin/group-icon-field.tsx
components/admin/group-detail.tsx
components/admin/change-owner-dialog.tsx
components/members/members-view.tsx
components/members/member-table.tsx
components/members/invite-drawer.tsx
components/members/received-invites.tsx
```

**Modified**

```
components/dashboard/dashboard-rail.tsx      generalized links + admin entry
components/dashboard/dashboard-topbar.tsx    breadcrumb prop
components/dashboard/dashboard-home.tsx      pass props only
components/icons.tsx                         Crown, MoreHorizontal, Trash, Settings, Building
lib/auth.ts                                  findAccount, listAccounts (AuthUser only)
docs/ARCHITECTURE.md                         decision log + page status
```

---

## 12. Conventions and gotchas

- **Tokens only.** No hard-coded hex in components; every colour comes from
  `app/globals.css` variables. Pastel palette, 12–16 px radii, 1 px soft borders,
  low-opacity shadows, 120–180 ms ease-out, respect `prefers-reduced-motion`.
- **CSS prefixes:** `admin-` for the admin shell, `mem-` for member management, `dash-`
  reused for the workspace shell. One CSS file per layout.
- **Reuse** existing primitives: `.chip` (+ `chip-mint`, `chip-accent`), `.eyebrow`,
  `.display-serif`, `.status-dot`, `Logo`, `getInitials`, `useAuthSession`, and the
  icons module.
- **Metadata** on each page: title + `robots: { index: false, follow: false }`, matching
  `app/dashboard/page.tsx`.
- **Client data after mount.** The store is localStorage; never read it during SSR or
  hydration mismatches will follow. Render a loading skeleton until `ready`.
- **Focus management** for drawers/dialogs: trap Tab, Escape to close, restore focus to
  the trigger, lock body scroll — copy the pattern already used by the dashboard day
  popup.
- **Accessibility:** labeled search, `aria-live` validation, keyboard-reachable card
  menus, roving focus where relevant, visible focus rings, 4.5:1 contrast on badges.
- **No test runner exists.** Verify with `npx tsc --noEmit` and `npm run build`, then the
  manual script below.
- **Security:** never render or export `salt`/`hash`. Do not record the admin password
  anywhere. The admin account is registered manually by the user in the browser.

---

## 13. Manual verification script

1. `npx tsc --noEmit` and `npm run build` both clean.
2. Register `noddy` (plus a second account, e.g. `tester`), sign in as `noddy`.
3. `/admin/groups` shows the empty state; admin nav entry is visible.
4. Create a group owned by `noddy`: unknown-username error, duplicate-name slug suffix,
   oversized image rejection, icon preview and removal.
5. Card shows icon/monogram, Owner line, member chip `1`, series chip `0`; search and all
   three sorts behave.
6. Refresh — the group persists. Open a second tab — changes appear without a refresh.
7. Detail page: stats, Owner card, read-only member table, unknown id panel.
8. Signed in as `tester`: `/admin/groups` renders the 403 panel; no admin nav entry.
9. As `noddy`, invite `tester` as Staff from `/settings/members`.
10. As `tester`: received-invite card appears; Accept joins and makes it the active
    group; Staff view shows only their own membership card.
11. As `noddy`: promote `tester` to Manager. As `tester`: roster visible, invite drawer
    locked to Staff, no row actions.
12. Invite a third account as Manager (Owner only). Verify a Manager cannot invite a
    Manager via the store guard.
13. Owner transfers are admin-only: Change Owner with outgoing Manager vs Staff.
14. Accept a second invite for the same user — active group switches (last accepted wins).
15. Remove a member; confirm the dialog names them and re-check role guards afterwards.
16. Keyboard-only pass on both drawers, the owner dialog, and the card action menu.
17. Widths 1440 / 1024 / 768 / 390: grid 3/2/1, admin rail becomes a drawer.

---

## 14. Implementation order

1. `lib/auth.ts` read helpers + `lib/groups.ts` store, guards, `lib/use-groups.ts`.
2. Icons + admin shell + 403 panel + admin CSS.
3. `/admin/groups` grid, cards, search/sort, create drawer, icon pipeline.
4. `/admin/groups/[id]` detail + Change Owner dialog.
5. Shell generalization (rail links + topbar breadcrumb) and `/settings/members`.
6. `docs/ARCHITECTURE.md` decision log + page status, then the verification script.

## 15. Recorded non-decisions

- There is no group switcher yet. A multi-group user manages whichever group they most
  recently accepted; this is intentional for v1 and belongs in the backlog.
- `/settings/members` originally showed series-assigned counts as a placeholder (`0`)
  until series assignment existed. Series is now real and the counts come from
  `series_assignments`; the placeholder is historical.
- Admin cannot see series, chapters, or translation text — metadata counts only, per
  `docs/ARCHITECTURE.md` section 3, item 9.

---

## 16. Implementation notes (recorded after the build)

Deviations from the spec above, all deliberate:

- **`app/admin/page.tsx` exists** and redirects to `/admin/groups`. `/admin` has no
  overview yet; a dead route would be worse than a redirect. The overview is deferred.
- **Extra shared files** beyond the §11 inventory: `lib/use-dialog.ts` (the focus-trap
  hook the spec asked us to copy), `lib/format.ts` (`formatShortDate`), and
  `components/group-avatar.tsx` / `components/role-badge.tsx` (primitives both shells
  need, so neither CSS file owns them). Their styles live in `app/globals.css`.
- **Rail entry is labelled "Members", not "Settings"**, on `/settings/members`. There is
  no `/settings` index route, so a "Settings" link would 404. The topbar trail is still
  `Workspace / Members`.
- **`revokeInvite` accepts two call shapes** — `revokeInvite(id, actor)` and
  `revokeInvite({ inviteId, actor })` — so the §4 signature and a more readable call
  site both work.
- **Card menu reads "Open group"** rather than "Open", to match the admin detail verb.
- **`app/admin/layout.tsx` re-declares the title template** (`{ default: "Admin",
  template: "%s · HwaFlow" }`). A plain `title` there consumes the root template, which
  left `/admin/groups` rendering as `<title>Groups</title>`.
- **Stagger delays are capped** at the ninth card so a long grid does not crawl in.
- **Rosters stack into cards at ≤560px** rather than scrolling sideways. Both
  `MemberTable` and the admin-detail roster switch their rows to CSS grid and hide the
  `thead`; Chrome keeps the table/row/cell roles in the accessibility tree, so the
  markup stays a real table. The member table's wrapper also stopped being an
  `overflow-x: auto` container — that container was silently clipping the row-action
  menu vertically on the last row.
- **The admin topbar logo no longer shrinks** (`flex-shrink: 0`). With `min-width: 0` it
  was compressed by ~14px at phone widths and the breadcrumb drew over the wordmark;
  only the trailing crumb segment gives up width now.
- **The stacked member row reserves a 2.35rem actions slot**, so "Joined" lines up on
  owner and non-owner rows even though the owner has no menu button.

### 16.1 Supabase swap (2026-10-22)

Sections 4 and 11 describe the original browser-local implementation. That
implementation is now historical. The delivered groups surfaces read Supabase and
write through server actions:

- **Reads** — `lib/server/groups.ts` (`listGroupsForViewer`, `getGroupBundle`,
  `listMembers`, `listReceivedInvites`) runs in server components. `/groups`,
  `/groups/[id]` and `/settings/members` receive typed props; nothing hydrates
  `hwaflow.groups.v1`.
- **Writes** — `lib/group-actions.ts` calls the RPCs (`create_group`, `invite_member`,
  `accept_invite`, `change_member_role`, `remove_group_member`, `revoke_invite`,
  `transfer_ownership`, `set_group_icon`) and returns `{ ok, code, message }`.
  RLS has no direct member-write policies, so the RPC role checks are the boundary.
- **Icons** — `group-icons` is a private bucket. The browser uploads
  `<group>/<uuid>.webp` after the group row exists; reads use signed URLs. A failed
  upload leaves a group without an icon rather than failing the create.
- **Active group** — stays in `localStorage` (`hwaflow.active-group.v1`) because it is
  a per-device UI preference, not shared content.
- **Refresh after save** — mutating actions return a result and the route calls
  `router.refresh()`; no action calls `revalidatePath` on a route that redirects.
- **Deferred** — `/admin/groups/[id]` and `change-owner-dialog` still use
  `lib/groups.ts` and its local store. Platform admins can read group metadata and
  membership under RLS but not series content, so this page needs a dedicated admin
  bundle before the local stores can be removed. Everything else in this document is
  Supabase-backed.

Verification actually run: `npx tsc --noEmit`, `npm run build`, all routes returning
200 with `noindex, nofollow`, a 54-assertion harness against the original `lib/groups.ts`
guards in §3 (not committed; there is no test runner), and layout probes at
320 / 360 / 390 / 561 / 600 px confirming `scrollWidth === innerWidth` and unclipped
row menus. The Supabase swap was verified with `npx tsc --noEmit` and a production
build; live behavior depends on `npx supabase db push` applying every pending
migration.

