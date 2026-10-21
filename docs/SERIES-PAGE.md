# HwaFlow — Groups page + day-grouped series (working spec)

> **Status:** plan approved, not implemented.
> **Created:** 2026-10-21.
> **Purpose:** self-contained context for coding the member-facing Groups surfaces and the
> first slice of the series module. Everything below was discussed and confirmed with the
> user unless marked otherwise.
> **Read alongside:** `docs/ARCHITECTURE.md` (architecture + data model) and
> `docs/GROUPS-PAGE.md` (admin/member groups delivery already built).

---

## 1. Current state of the repo

- Repo is a git repo on branch `main`, HEAD `4dabaf1` — `docs: lock groups page decisions and build spec`.
- The groups delivery (admin console, `/settings/members`, shared primitives, generalized
  dashboard rail/topbar) is **built but uncommitted**:
  - modified: `app/dashboard/dashboard.css`, `app/globals.css`,
    `components/dashboard/dashboard-home.tsx`, `components/dashboard/dashboard-rail.tsx`,
    `components/dashboard/dashboard-topbar.tsx`, `components/icons.tsx`,
    `docs/ARCHITECTURE.md`, `docs/GROUPS-PAGE.md`, `lib/auth.ts`
  - new: `app/admin/`, `app/settings/`, `components/admin/`, `components/members/`,
    `components/group-avatar.tsx`, `components/role-badge.tsx`, `lib/format.ts`,
    `lib/group-icon.ts`, `lib/groups.ts`, `lib/use-dialog.ts`, `lib/use-groups.ts`
- `node_modules` and `.next` are already ignored.
- There is **no series module yet**; `seriesCountFor` / `chapterCountFor` in `lib/groups.ts`
  currently return an honest `0`.
- Intended git flow (requires Build mode):
  ```powershell
  git switch -c feat/groups-and-series
  git add -A
  git commit -m "feat: build groups admin console and member settings"
  ```
  Then implement this spec in its own commits on that branch.

---

## 2. Locked decisions from the discussion

| Area | Decision |
|---|---|
| Routes | `/groups` list, `/groups/[id]` detail, `/series/[id]` minimal series page |
| Sidebar | **Groups** entry below **Dashboard**, `Layers` icon, active on `/groups*` and `/series/[id]` |
| Active group | Opening a group does **not** change the active group. `/settings/members` keeps using the last accepted group. The groups list marks that group **Active**. |
| Money — Owner | Group total for that group (`groupEarningsThisMonth(groupId)`) |
| Money — Manager | **Only their own earnings in that group** (`memberEarningsThisMonth(groupId, username)`) |
| Money — Staff | Their own earnings in that group |
| Group total visibility | **Owner only.** Managers never see the group-wide total. |
| Dashboard money | Total the signed-in user has earned (their own, across groups). Must read **$0.00** for now. |
| Series stat | Owner/Manager: every series in the group. Staff: only series assigned to them. |
| Assign picker | Every group member **except the Owner** (Managers + Staff), multi-select, with search |
| Manager visibility | Managers see **every** series in the group (needed for approvals and assignment changes), regardless of assignment |
| Assignment meaning | Assignment controls **calendar visibility and release notifications** for that person. Unassigned Managers still see the series on the group/series pages but would not see it in their calendar and do not get its release notifications. (Calendar wiring is deferred — see §16.) |
| Owner assignment | Owner is **not assignable** and never appears in the picker |
| Assignment notification | Yes — persisted in-app notification for every newly assigned member (skip the person doing the assigning) |
| Notifications store | Real persisted per-user store. It **replaces** the three static demo notifications in the dashboard bell. |
| Cover | Optional. If omitted or rejected, use a deterministic default cover. |
| Create surface | Centered popup modal (user called it a popup), not the admin right-side drawer |
| Release day | Single weekday per series, required. Group page groups series by day, Monday → Sunday. |
| Series page | Build a minimal `/series/[id]` page (user chose this over display-only tiles) |
| Money data | Derived from approved chapters; chapters/approvals do not exist, so all values are `0` with an honest note |
| Series edits | Only assignment changes for now. No title/cover/metadata editing, no delete/archive UI. |

### Deliberately deferred

- Chapter module, approvals, earnings actually becoming non-zero.
- Wiring the dashboard weekly calendar to real series release days.
- Release-day notifications (the assignment notification store is ready to reuse).
- Series title/cover editing, series deletion/archiving UI.
- Group switching semantics beyond the read-only detail (active group unchanged).
- Group search/sort on `/groups` (not requested).
- Any platform-admin access to series content (admin still sees metadata counts only).

---

## 3. Routes and navigation

| Route | Purpose |
|---|---|
| `/groups` | All groups the signed-in user is an accepted member of, as cards. |
| `/groups/[id]` | Group header → 3 stats → create button (Owner/Manager) → Monday–Sunday day lanes of series tiles. |
| `/series/[id]` | Minimal series page: banner, metadata, description, assigned members, manage-assignments action for Owner/Manager. |

Next 16 note: dynamic server pages receive `params: Promise<{ id: string }>` and must
`const { id } = await params` before rendering the client view.

Breadcrumbs / rail:

- `/groups` → trail `Workspace / Groups`, rail active `groups`.
- `/groups/[id]` → trail `Workspace / Groups / {group name}`, rail active `groups`.
- `/series/[id]` → trail `Workspace / Groups / {series title}`, rail active `groups`.

Each page gets `metadata` with `title` and `robots: { index: false, follow: false }`,
matching `app/dashboard/page.tsx`.

### Sidebar change

In `components/dashboard/dashboard-home.tsx` and `components/members/members-view.tsx`,
add to the existing `links` array, directly below Dashboard:

```ts
{
  key: "groups",
  href: "/groups",
  label: "Groups",
  icon: Layers,
}
```

Use the same entry on the new pages. Do not move `/dashboard` into a route group.
Do not add a rail unread badge.

---

## 4. Permissions matrix

| Action | Owner | Manager | Staff |
|---|:--:|:--:|:--:|
| Open `/groups` | ✅ (member of ≥1 group) | ✅ | ✅ |
| Open a group they belong to | ✅ | ✅ | ✅ |
| Open a group they do not belong to | ❌ | ❌ | ❌ |
| See every series in the group | ✅ | ✅ | assigned only |
| Open `/series/[id]` | any series in group | any series in group | assigned only |
| Create series | ✅ | ✅ | ❌ |
| Assign / unassign members | ✅ | ✅ | ❌ |
| Series stat | group total | group total | assigned count |
| Money stat | group total | own earnings | own earnings |
| Appear in assign picker | ❌ | ✅ | ✅ |
| Get assignment notification | ❌ (not assignable) | when assigned | when assigned |
| Accept/decline invites, member management | unchanged (`/settings/members`) | unchanged | unchanged |

**Enforce in the store, not just the UI.** A Staff account calling `createSeries` or
`setSeriesAssignments` must throw even if a control is accidentally rendered.

Platform admin (`noddy`) is **not** granted group content access. If not a member, the
admin gets the same "not found or no access" panel.

---

## 5. Data layer

### 5.1 `lib/series.ts` (new)

Storage: single key `hwaflow.series.v1` so series + assignments write atomically.
Custom event: `hwaflow:series`. Also listen to `storage` for cross-tab sync.

```ts
export type ReleaseDay = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Monday … 6 = Sunday

/** public.series (future Supabase table) */
export type Series = {
  id: string;
  groupId: string;
  title: string;
  genre: string | null;
  description: string | null;
  coverDataUrl: string | null;   // swap for `cover_path` + Storage URL later
  releaseDay: ReleaseDay;
  createdBy: string;             // username
  createdAt: string;             // ISO
  archived: boolean;             // always false in this delivery
};

/** public.series_assignments (future Supabase table) */
export type SeriesAssignment = {
  id: string;
  seriesId: string;
  groupId: string;               // denormalised for fast reads / RLS shape
  userId: string;
  username: string;
  assignedBy: string;            // username
  createdAt: string;
};

export type SeriesState = {
  version: 1;
  series: Series[];
  assignments: SeriesAssignment[];
};
```

Store API:

```ts
// reads
listSeriesForGroup(groupId: string): Series[];                 // unarchived, releaseDay then title
listSeriesForViewer(groupId: string, viewerUsername: string): Series[];
getSeries(seriesId: string): Series | null;
getAssignments(seriesId: string): SeriesAssignment[];
getAssignedUsernames(seriesId: string): string[];
isAssigned(seriesId: string, username: string): boolean;
countSeriesInGroup(groupId: string): number;
countSeriesForMember(groupId: string, username: string): number;
canViewSeries(seriesId: string, username: string): boolean;

// writes (validate + throw SeriesError, mirroring GroupError)
createSeries(input: CreateSeriesInput): Series;
setSeriesAssignments(input: SetAssignmentsInput): void;
removeMemberAssignments(groupId: string, userId: string): void;

// subscription
subscribeSeries(listener: () => void): () => void;
getSeriesState(): SeriesState;
```

Input shapes:

```ts
type CreateSeriesInput = {
  groupId: string;
  title: string;
  genre?: string | null;
  description?: string | null;
  coverDataUrl?: string | null;
  releaseDay: number;
  assigneeUsernames?: string[];
  actor: string;                 // signed-in username
};

type SetAssignmentsInput = {
  seriesId: string;
  assigneeUsernames: string[];
  actor: string;
};
```

Validation rules (in the store):

- Actor must be Owner or Manager of `groupId`.
- `title` 2–80 chars after trimming/collapsing whitespace.
- `releaseDay` must be an integer 0–6.
- `genre` optional, ≤32 chars.
- `description` optional, ≤600 chars.
- `coverDataUrl` optional; must start with `data:image/` and be within the cover byte cap.
- Every assignee must be an existing member of the group and must **not** be the Owner.
  De-duplicate usernames.
- Title uniqueness is **not** enforced (duplicate titles are allowed; there is no slug yet).
- `setSeriesAssignments` diffs against current assignments:
  - newly added → create assignment rows + notification
  - removed → delete assignment rows
  - unchanged → leave untouched
- `removeMemberAssignments` deletes all assignment rows for that user in that group.
  (Called by `members-view` right after `removeMember`; `lib/groups.ts` must not import
  `lib/series.ts` or it creates a cycle.)

`SeriesError` codes: `not-found`, `forbidden`, `not-member`, `invalid-title`,
`invalid-day`, `invalid-cover`, `storage`, `unknown`.

IDs: `crypto.randomUUID()` with the same fallback pattern used in `lib/groups.ts`.

### 5.2 `lib/notifications.ts` (new)

Storage: single key `hwaflow.notifications.v1`. Event: `hwaflow:notifications`,
plus `storage` listener.

```ts
export type NotificationTone = "mint" | "lavender" | "peach" | "sky";

export type AppNotification = {
  id: string;
  username: string;              // recipient (normalized)
  kind: "series-assigned";
  title: string;
  body: string;
  href: string | null;           // e.g. /series/{id}
  tone: NotificationTone;
  read: boolean;
  createdAt: string;             // ISO
};

type NotificationsState = {
  version: 1;
  items: AppNotification[];
};
```

API:

```ts
listNotificationsFor(username: string): AppNotification[]; // newest first
unreadCountFor(username: string): number;
pushNotification(input: Omit<AppNotification, "id" | "read" | "createdAt">): void;
markNotificationRead(id: string, username: string): void;
markAllNotificationsRead(username: string): void;
subscribeNotifications(listener: () => void): () => void;
getNotificationsState(): NotificationsState;
```

Assignment notification copy (written by `createSeries` / `setSeriesAssignments`):

- `title`: `Added to {series.title}`
- `body`: `{group.name} · releases {Monday}`
- `href`: `/series/{series.id}`
- `tone`: `"lavender"`
- `kind`: `"series-assigned"`
- `read`: `false`
- recipient: every newly assigned username **except** the actor.

### 5.3 `lib/earnings.ts` (new)

All values derive from approved chapters (`chapters.status = 'approved'`), per
ARCHITECTURE R4. Chapters do not exist yet, so every function returns `0`. Keep the
signatures stable so the chapter module can fill them in.

```ts
totalEarningsThisMonth(username: string): number;              // dashboard: user's own total
approvedChaptersThisMonth(): number;                            // 0
groupEarningsThisMonth(groupId: string): number;                // Owner-only stat
memberEarningsThisMonth(groupId: string, username: string): number; // Manager + Staff stat
```

Add `formatMoney(amount: number, currency: string): string` to `lib/format.ts` using
`Intl.NumberFormat("en-US", { style: "currency", currency })` (2 decimals; the group's
`currency` field).

### 5.4 `lib/groups.ts` changes

Add:

```ts
listGroupsForUser(username: string): Array<{ group: Group; member: GroupMember }>;
```

- Only accepted memberships (rows in `members`).
- Sort active group first (using `activeByUser`), then by group name A-Z.
- Reuse `withDisplayName`.

Remove `seriesCountFor` (the stub) and update its consumers to import counts from
`lib/series.ts`. Keep `chapterCountFor` returning `0` with the existing honest comment.

Do **not** change `getActiveGroupFor`, invite logic, role guards, or
`removeMember`'s permission behavior.

### 5.5 Cover pipeline — `lib/series-cover.ts` (new)

Mirror `lib/group-icon.ts` but with a portrait crop:

- Accept `image/*`; reject files over 5 MB with a readable message.
- Decode (`createImageBitmap`, `Image` + object URL fallback).
- Cover-crop to 2:3, draw to a 480×720 canvas.
- Export `image/webp` at quality ~0.82; if over the cap, retry once at ~0.65.
- Cap the data URL at **120 KB** (`MAX_SERIES_COVER_BYTES`); reject with a clear error.
- Return `data:image/webp;base64,...`.
- Leave a marked comment: swap the body for a Supabase Storage upload to the `covers`
  bucket and return a public URL; consumers only read `series.coverDataUrl`.
- No cover → the UI renders the deterministic fallback (pastel gradient keyed to the
  title + monogram), not an image.

### 5.6 Hooks and sync

- `lib/use-series.ts` — `useSeries()` returns `{ state, ready }`, reads after mount,
  subscribes to `hwaflow:series` + `storage`. Model on `lib/use-groups.ts`.
- `lib/use-notifications.ts` — `useNotifications()` same pattern.
- All views read after mount only. Never read localStorage during SSR/hydration.
- Show a loading state until auth + every required store is `ready`.
- Same-tab writes are announced by the custom events; other tabs by `storage`.

### 5.7 Member removal cleanup

In `members-view.tsx`, after a successful `removeMember(...)`:

```ts
removeMemberAssignments(activeGroup.id, removeTarget.userId);
```

Then show the existing success notice. The groups store remains free of a series import.
Document this cross-store orchestration in a comment.

---

## 6. `/groups` — group list

Shell: existing workspace rail + topbar.

Page header:

- Eyebrow: `Workspace`
- Title: `Your groups`
- Subline: `{n} group{s} · choose one to see its series.`
- No create-group action (platform admin creates groups).

Grid: `repeat(auto-fill, minmax(280px, 1fr))`, 3/2/1 columns.

Each card:

- Group icon / monogram (`GroupAvatar` md or lg)
- Group name
- Viewer's `RoleBadge`
- Currency chip
- `{n} members` chip
- `{n} series` chip — **role-scoped**: Owner/Manager = group total; Staff = assigned count
- **Active** chip when `activeByUser[user.username] === group.id`
- Whole card links to `/groups/[id]` (accessible label `Open {name}`)
- No created date, no action menu, no money on the list

Empty state (user belongs to no groups):

- Title: `You're not in a group yet`
- Copy: `Ask an Owner to invite your username, or accept a pending invite.`
- `@{username}` chip
- Link to `/settings/members` — `Go to member settings`

No-results/search/sort states are not part of this delivery.

Loading: skeleton cards (no layout shift), auth loading reuses the `dash-loading` pattern.

---

## 7. `/groups/[id]` — group detail

Order on the page, top to bottom, exactly as requested:

### 7.1 Header

- Back link: `All groups` → `/groups`
- `GroupAvatar` lg
- Eyebrow: `Group`
- Title: group name
- Meta row: `RoleBadge` (viewer), currency chip, `@{slug}`
- Optional subtle **Active** chip when this is the active group
- No "switch group" control (opening does not change the active group)

### 7.2 Stats (3 cards)

1. **Members** — total group members. Note: `Everyone in the group`.
2. **Series** —
   - Owner/Manager: every unarchived series in the group. Note: `In this group`.
   - Staff: only series assigned to them. Note: `Assigned to you`.
3. **Money earned** —
   - Owner: `groupEarningsThisMonth(groupId)`, note `Group total this month`.
   - Manager/Staff: `memberEarningsThisMonth(groupId, username)`, note
     `Your approved work in this group`.
   - Value formatted with the group currency via `formatMoney`.
   - Since approvals do not exist, the value is `$0.00` (or the group's currency) and the
     note adds `No approved chapters yet.`

Stats are a 3-column row on desktop, stacked on mobile, using tokens (no hard-coded hex).

### 7.3 Series section header + create button

Directly **below the stats**:

- Left: eyebrow `Library`, title `Series`, count chip.
- Right (Owner/Manager only): primary button `+ New series`.
- Staff never sees the create button.
- Clicking opens the create-series popup (§8).
- Store re-checks the role on submit.

### 7.4 Day lanes — Monday through Sunday

All seven days always render, in order.

Each lane:

```
Monday                                   3 series
[ tile ] [ tile ] [ tile ] →  (horizontally scrollable)
```

- Section heading with the weekday and its count.
- Track: horizontal flex, `overflow-x: auto`, `scroll-snap-type: x mandatory`,
  a styled thin scrollbar, and `scroll-snap-align: start` on tiles.
- Keyboard: the scroll region is focusable (`tabIndex=0`, `role="region"`,
  `aria-label="Monday series, scroll horizontally"`); tiles are links.
- Empty lane copy:
  - Owner/Manager: `Nothing releasing Monday.`
  - Staff: `No series assigned to you on Monday.` (only when the viewer has no assigned
    series that day)
- Visibility:
  - Owner/Manager: all series, including ones they are not assigned to.
  - Staff: only assigned series.

### 7.5 Series tile

- Portrait cover (2:3) or generated fallback.
- Title, clamped to 2 lines.
- Genre chip when present.
- Assignee presentation:
  - Owner/Manager: up to 3 avatar initials + `+N`; if none, `Unassigned`.
  - Staff: a `You` / `Assigned to you` chip.
- Whole tile links to `/series/[id]`.
- Hover/focus: subtle lift, border emphasis, 120–180 ms ease-out; respect
  `prefers-reduced-motion`.
- Fixed tile width (~10.5–11 rem) so the lane scrolls horizontally at every viewport.

### 7.6 Access / missing states

- Not a member of the group ID (or stale ID): centered panel
  `Group not found` + `You may not have access, or this group was removed from this browser.`
  + back link to `/groups`.
- Signed out: redirect to `/login`.

### 7.7 Footer

`Preview build — groups, series and assignments stay in this browser.`

---

## 8. Create series popup

A centered modal dialog (the user asked for a popup), overlaying a dimmed backdrop,
using `useDialogA11y` for Tab trapping, Escape, body-scroll lock, focus-in and
focus-restore. Not the admin right-side drawer.

Fields, in order:

1. **Title** — required, 2–80 chars.
2. **Cover** — optional image upload field (`components/groups/series-cover-field.tsx`):
   drop zone / file picker, 2:3 preview, remove button, generated fallback preview,
   keyboard accessible. Reject >5 MB or >120 KB output with an inline error.
3. **Genre** — optional text input with a `<datalist>` of suggestions:
   Action, Adventure, Comedy, Drama, Fantasy, Horror, Isekai, Mystery, Romance, Sci-Fi,
   Slice of Life, Thriller. Max 32 chars.
4. **Description** — optional textarea, max 600 chars, live counter optional.
5. **Release day** — required. Seven-day segmented control (Mon…Sun) or a select.
   No silent default that could be submitted accidentally; validate `Pick a release day.`
6. **Assign members** — a button (`Assign members`) that opens an anchored dropdown
   (not a nested modal) containing:
   - a labeled search input filtering by display name or username (case-insensitive, trimmed)
   - a checkbox list of every group member **except the Owner** (Managers + Staff)
   - role badges and `@username` on each row
   - selected people shown as removable chips above/below the trigger
   - empty search result: `No members match "{query}".`
   - Escape closes only the dropdown, not the whole modal (stop propagation); focus
     returns to the trigger.
   - Helper copy: `Managers see every series anyway. Assignment decides who gets this
     series on their calendar and in notifications.`

Footer: `Cancel` / `Create series`.

On submit:

1. Validate locally (inline errors, `aria-live="polite"`, focus first invalid field).
2. Call `createSeries` — store re-validates permissions and all fields.
3. Write series + assignments in one atomic store write.
4. Push notifications for newly assigned members (skip the actor).
5. Close the modal, show a success notice (`{title} was created.`), and let the store
   event place the tile in the correct day lane immediately.
6. On error, keep the modal open and show the store's message.

While the cover is compressing, disable submit and show `Preparing cover…`.

---

## 9. `/series/[id]` — minimal series page

Shell: workspace rail/topbar.

- Back link: group name → `/groups/{groupId}`.
- **Banner**: uploaded cover (or generated gradient), cover thumb, series title.
- Chips: genre (when present), `Releases Monday`, maybe `In {group name}`.
- **Description** panel:
  - present → paragraph
  - absent → `No description yet.`
- **Assigned members** panel:
  - list of assignees: initials avatar, display name, `@username`, role badge
  - if none: `Nobody is assigned to this series yet.`
  - Owner/Manager: `Manage assignments` button
  - Staff: read-only
- **Manage assignments dialog**:
  - same `AssigneePicker` as the create form
  - pre-checked with current assignees
  - copy explains that assignment controls calendar/notifications, and that Managers can
    see every series regardless
  - save → `setSeriesAssignments`; new assignees get notifications; removed staff lose
    access immediately; success notice
- **Chapters** panel: honest empty state
  `No chapters yet — chapter tracking arrives with the chapter module.` No fake numbers.
- Footer: preview-build note.

Access rules:

- Not signed in → `/login`.
- Series missing or archived → `Series not found` panel + back to `/groups`.
- Viewer is not a member of the series' group → `not found or no access`.
- Staff not assigned to this series → `You don't have access to this series.` + back link.
- Owner/Manager of the group → always allowed.

No editing of title/cover/genre/description/release day in this delivery.

---

## 10. Dashboard + notifications changes

### 10.1 Topbar bell — real notifications

`components/dashboard/dashboard-topbar.tsx`:

- Remove the static `notifications` import from `lib/dashboard-data.ts`.
- Use `useAuthSession` + `useNotifications`.
- Show the signed-in user's notifications, newest first (cap the popover list at ~6).
- Unread badge = `unreadCountFor(user.username)`.
- Each item:
  - tone dot from `notification.tone`
  - title, body
  - relative time via a new `formatRelativeTime(iso)` helper
    (`Just now`, `N min ago`, `N hr ago`, `N d ago`, then `formatShortDate`)
  - unread style when `!read`
  - if `href` exists, the row is a link; clicking marks it read then navigates
- `Mark all read` calls `markAllNotificationsRead(user.username)` and persists.
- Empty state inside the popover: `You're all caught up.`
- `aria-label` includes the unread count.
- No demo notifications remain. This is intentional and confirmed.

### 10.2 Dashboard money + approved count

`components/dashboard/dashboard-home.tsx`:

- Import `totalEarningsThisMonth`, `approvedChaptersThisMonth` from `lib/earnings.ts`.
- Money panel value: `totalEarningsThisMonth(user.username)` → `$0.00` today.
- When the value is `0`:
  - hide the `+$36.00` trend chip
  - hide the fake sparkline (or replace with a neutral empty note)
  - subtitle/footnote: `No approved chapters yet. Credit appears here when a Manager approves work.`
- When the value is non-zero in the future, the existing chip/sparkline layout can return.
- Heading: derive the current month name (`October`) instead of hard-coding.
- Hero line `...shipped {approvedChaptersThisMonth()} chapters this month` → `0`, with
  copy adjusted so it doesn't read as a failure (`hasn't shipped any chapters this month yet.`).
- Leave the weekly calendar preview data untouched for now; the footer already labels the
  build as preview. Wiring it to real series release days is deferred (§16).

`lib/dashboard-data.ts`:

- Remove `approvedThisMonth`, `earningsThisMonth`, `notifications`, and the
  `Notification` type.
- Keep the week/calendar preview data.
- Remove `earningBars` if it is no longer used.

---

## 11. Consistency updates on existing surfaces

### `/settings/members`

- Use `useSeries()` so counts react to series writes.
- Member table: replace the hard-coded `0` with
  `countSeriesForMember(activeGroup.id, member.username)`.
  Add a `seriesCounts: Record<string, number>` prop to `MemberTable` (keyed by member id)
  or a `seriesCountFor(member)` callback.
- Staff self-card: `Series assigned` shows the real assigned count.
- On successful `removeMember`, call `removeMemberAssignments(groupId, userId)`.
- The remove dialog copy already says assignments are unassigned — make that true.

### Admin console

- `components/admin/groups-view.tsx`: replace `seriesCountFor` import with
  `countSeriesInGroup` from `lib/series.ts`; subscribe with `useSeries()` so cards update.
- `components/admin/group-detail.tsx`: same for the **Series** stat. The **Chapters**
  stat stays `0` with `Available with the chapter module`.
- Admin still sees metadata counts only, never titles/descriptions/covers. This delivery
  does not add content access.

### Group stats old stubs

- Remove `seriesCountFor` from `lib/groups.ts`.
- Keep `chapterCountFor` as an honest `0` until chapters exist.

---

## 12. Design system and implementation conventions

- **Tokens only.** No hard-coded hex in components; use `app/globals.css` variables.
- **Palette:** pastel; muted mint/lavender/peach/sky on near-white surfaces; dark mode
  uses desaturated slate. Never saturated primaries.
- **Shape:** 12–16 px radii, 1 px soft borders, low-opacity shadows.
- **Density:** roomy.
- **Reuse:** `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-sm`, `.chip`, `.chip-mint`,
  `.chip-accent`, `.chip-peach`, `.eyebrow`, `.display-serif`, `.status-dot`,
  `.tnum`, `GroupAvatar`, `RoleBadge`, `getInitials`, `formatShortDate`,
  `useDialogA11y`, `useAuthSession`, `useGroups`, `DashboardRail`, `DashboardTopbar`.
- **CSS prefixes:** `grp-` for the groups surfaces (`/groups*`, shared series primitives)
  and `sr-` for series-page-only styles. One CSS file per layout:
  - `app/groups/groups.css` imported by `app/groups/layout.tsx`
  - `app/series/series.css` imported by `app/series/layout.tsx`, which also imports
    `../groups/groups.css` for the shared cover/tile primitives.
  - Both layouts also import `../dashboard/dashboard.css` so the shell renders correctly
    (or rely on the existing global dashboard CSS import pattern; match how
    `app/settings/layout.tsx` does it).
- **State:** client-only after mount. Never read localStorage during SSR.
- **Motion:** 120–180 ms ease-out, no bounce; cap stagger delays at ~9 items; respect
  `prefers-reduced-motion`.
- **Accessibility:** labeled inputs, `aria-live` errors, visible focus rings, keyboard
  access to lanes/popovers, Escape/focus restore for dialogs, 4.5:1 contrast on chips.
- **Security:** never render or export password salt/hash. Do not record the admin password.
- **No test runner exists.** Verify with `npx tsc --noEmit`, `npm run build`, then the
  manual script in §15.

---

## 13. Files

### New

```
lib/series.ts
lib/use-series.ts
lib/series-cover.ts
lib/notifications.ts
lib/use-notifications.ts
lib/earnings.ts

app/groups/layout.tsx
app/groups/groups.css
app/groups/page.tsx
app/groups/[id]/page.tsx

app/series/layout.tsx
app/series/series.css
app/series/[id]/page.tsx

components/groups/groups-view.tsx
components/groups/group-card.tsx
components/groups/group-detail-view.tsx
components/groups/day-lane.tsx
components/groups/series-tile.tsx
components/groups/series-cover.tsx
components/groups/series-cover-field.tsx
components/groups/assignee-picker.tsx
components/groups/create-series-dialog.tsx
components/groups/manage-assignments-dialog.tsx

components/series/series-view.tsx
```

Optional split-outs if the views get large: `group-stats.tsx`, `series-panels.tsx`.
Do not create empty placeholder files.

### Modified

```
lib/groups.ts                              listGroupsForUser; remove seriesCountFor
lib/format.ts                              formatMoney, formatRelativeTime
lib/dashboard-data.ts                      remove mock earnings + notifications
components/dashboard/dashboard-home.tsx    Groups nav link; $0 earnings; 0 approvals
components/dashboard/dashboard-topbar.tsx  real notifications + relative time
components/members/members-view.tsx        nav link; real counts; unassign on removal
components/members/member-table.tsx        series count prop
components/admin/groups-view.tsx           real series count
components/admin/group-detail.tsx          real series count
docs/ARCHITECTURE.md                       page inventory + decision log
```

Possibly `components/icons.tsx` if a missing icon is genuinely needed; existing `Layers`,
`Users`, `Plus`, `Search`, `X`, `Check`, `AlertCircle`, `Trash`, `Crown`, `Coins`,
`CalendarDays`, `ArrowLeft`, `ArrowUpRight` cover this delivery.

---

## 14. Edge cases and validation summary

- Group ID not in the store → not-found panel.
- Series ID not in the store / archived → not-found panel.
- Viewer not a member of the group → no-access panel.
- Staff direct-linking to an unassigned series → no-access panel.
- Staff has no groups → `/groups` empty state.
- Group has no series:
  - Owner/Manager: `No series yet` + `Create the first series` button.
  - Staff: `No series assigned to you yet` + explanation.
- A day with no series → empty lane (all 7 lanes still render).
- No cover → generated pastel cover; preview and tiles match.
- Cover too large / unreadable → inline error, submit stays disabled only while processing.
- Duplicate assignee selections → de-duplicated.
- Assignee removed from group → assignment cleanup on removal.
- Duplicate series titles → allowed.
- localStorage quota exceeded → `SeriesError("storage")` with a readable message.
- Cross-tab write while a modal is open → store event updates the page; the modal keeps
  its local form state.
- Notifications for a member removed later remain in their store unless explicitly
  purged; not required in this delivery.
- Money is always `0` until chapters/approvals exist; never fabricate a number.
- No notification for release days yet; only assignment notifications.

---

## 15. Manual verification script

1. `npx tsc --noEmit` and `npm run build` both clean.
2. Register/sign in as an Owner, a Manager, and a Staff account (plus a second group for
   multi-group coverage).
3. `/groups` lists only memberships; active group is marked; opening a group does **not**
   change the active group used by `/settings/members`.
4. Owner sees the group total money stat; Manager and Staff see only their own; all read
   `$0.00` with the no-approvals note.
5. Owner and Manager see `+ New series`; Staff does not.
6. Create series on several weekdays with a Manager and Staff assigned; confirm tiles land
   under the correct day lanes immediately.
7. Owner/Manager lanes show every series; Staff lanes show only assigned series.
8. Direct URL to a group/series the viewer isn't in / isn't assigned → no-access panel.
9. Assigned Manager and Staff receive a persisted notification; the unassigned Manager
   does not; the Owner does not appear in the picker.
10. Refresh: series, assignments, cover, notification read state all persist.
11. Open a second tab: new series/assignments/read state sync without refresh.
12. `/series/[id]`: description/assignment panels; Manage assignments adds/removes people;
    newly added get notifications; removed Staff lose access.
13. Remove a member from `/settings/members`: their assignments disappear and counts update.
14. Admin group grid/detail show real series counts; chapters stay `0` with the module note;
    admin still sees no series titles.
15. Dashboard money is `$0.00`, approved count is `0`, and the bell shows only real
    notifications (empty state when none).
16. Widths 1440 / 1024 / 768 / 390: group grid 3/2/1; day lanes scroll horizontally at
    every width; stats stack; modal usable; no page-level horizontal overflow.
17. Keyboard-only pass: rail, group cards, day lane scroll region, create modal, assignee
    popup (Escape closes popup only), manage dialog, bell.

---

## 16. Deferred, explicitly out of scope

- Wiring the dashboard weekly calendar to real series release days. When it lands:
  Owner sees all, Manager/Staff see assigned only (matching the stated rule), and the
  existing preview calendar is replaced rather than merged.
- Release-day notifications (reuse `lib/notifications.ts`).
- Actual earnings: chapters, approvals, per-series rates, and non-zero money.
- Series edit/delete/archive UI beyond assignments.
- `/series` index page; only `/series/[id]` exists.
- Group search/sort, group creation from the workspace, group switcher behavior change.
- Supabase RLS migration; shapes mirror the future tables so it stays mechanical.
- Admin access to series content.
- In-app notification preferences / release subscriptions.

---

## 17. Defaults chosen during planning (confirmed or safe to change)

- Cover optional with a deterministic default (confirmed by user).
- Create series is a centered popup, not a drawer (user called it a popup).
- Release day is a single weekday (the group page groups by one day).
- Duplicate series titles are allowed.
- Assignment picker is multi-select.
- Owner is excluded from assignment.
- Group page lists all seven days even when empty.
- No group-wide money for Managers (confirmed by user: Owner only).
- Dashboard money is the user's own total, not a group total (confirmed).
