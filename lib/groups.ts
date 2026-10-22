/**
 * Browser-local groups store.
 *
 * Supabase is the locked-in database, but no project keys exist in this build
 * yet. Groups therefore live in one localStorage key so every write is atomic
 * (read the whole object, change it, write it back, notify listeners).
 *
 * Shapes mirror the future tables one-for-one, which keeps the migration
 * mechanical:
 *
 *   Group        -> public.groups
 *   GroupMember  -> public.group_members
 *   GroupInvite  -> public.group_invites
 *
 * Permission checks live here, not in components. A manager calling
 * `changeRole` throws even if a control is accidentally rendered.
 */

import { findAccount, normalizeUsername } from "./auth";
import {
  MAX_GROUP_ICON_BYTES,
  groupIconByteSize,
} from "./group-icon";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type GroupRole = "owner" | "manager" | "staff";

/** public.groups */
export type Group = {
  id: string;
  name: string;
  slug: string;
  currency: string;
  iconDataUrl: string | null;
  createdBy: string;
  createdAt: string;
};

/** public.group_members */
export type GroupMember = {
  id: string;
  groupId: string;
  userId: string;
  username: string;
  displayName: string;
  role: GroupRole;
  invitedBy: string | null;
  joinedAt: string;
};

/** public.group_invites */
export type GroupInvite = {
  id: string;
  groupId: string;
  username: string;
  role: "manager" | "staff";
  status: "pending" | "accepted" | "revoked";
  invitedBy: string;
  createdAt: string;
};

export type GroupsState = {
  version: 1;
  groups: Group[];
  members: GroupMember[];
  invites: GroupInvite[];
  activeByUser: Record<string, string>;
};

export type GroupFailure =
  | "not-found"
  | "invalid-name"
  | "invalid-currency"
  | "invalid-role"
  | "owner-not-found"
  | "invitee-not-found"
  | "already-member"
  | "already-invited"
  | "forbidden"
  | "not-member"
  | "invite-not-found"
  | "invite-not-pending"
  | "invite-not-yours"
  | "owner-immutable"
  | "icon-too-large"
  | "storage"
  | "unknown";

export class GroupError extends Error {
  code: GroupFailure;

  constructor(code: GroupFailure, message?: string) {
    super(message ?? code);
    this.name = "GroupError";
    this.code = code;
  }
}

/* ------------------------------------------------------------------ */
/* Constants + guards                                                  */
/* ------------------------------------------------------------------ */

const GROUPS_KEY = "hwaflow.groups.v1";
const GROUPS_EVENT = "hwaflow:groups";

/** Preview-build stand-in until `profiles.is_platform_admin` exists. */
export const PLATFORM_ADMIN_USERNAME = "noddy";

export const GROUP_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "JPY",
  "KRW",
] as const;

export type GroupCurrency = (typeof GROUP_CURRENCIES)[number];

export const ROLE_LABEL: Record<GroupRole, string> = {
  owner: "Owner",
  manager: "Manager",
  staff: "Staff",
};

export function isPlatformAdmin(username?: string | null): boolean {
  if (!username) return false;
  return normalizeUsername(username) === PLATFORM_ADMIN_USERNAME;
}

export function roleRank(role: GroupRole): number {
  if (role === "owner") return 3;
  if (role === "manager") return 2;
  return 1;
}

export function canManageMembers(role: GroupRole): boolean {
  return role === "owner" || role === "manager";
}

export function canChangeRoles(role: GroupRole): boolean {
  return role === "owner";
}

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

export function cleanGroupName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** URL-safe base slug. Falls back to "group" for names with no ASCII letters. */
export function slugBase(name: string): string {
  const slug = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "group";
}

/** Adds -2, -3 … until the slug is free. */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export type GroupAccent = "mint" | "lavender" | "peach" | "sky";

const GROUP_ACCENTS: GroupAccent[] = ["mint", "lavender", "peach", "sky"];

/** Deterministic accent for the monogram fallback. */
export function groupAccent(name: string): GroupAccent {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }
  return GROUP_ACCENTS[hash % GROUP_ACCENTS.length];
}

export function groupMonogram(name: string): string {
  const trimmed = name.trim();
  return (trimmed[0] ?? "G").toUpperCase();
}

export function validateGroupName(value: string): string | null {
  const name = cleanGroupName(value);
  if (!name) return "Give the group a name.";
  if (name.length < 2) return "Use at least 2 characters.";
  if (name.length > 60) return "Keep it to 60 characters or fewer.";
  return null;
}

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

function canUseStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const probe = "__hwaflow_groups_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function emptyState(): GroupsState {
  return {
    version: 1,
    groups: [],
    members: [],
    invites: [],
    activeByUser: {},
  };
}

export function getGroupsState(): GroupsState {
  if (!canUseStorage()) return emptyState();
  try {
    const raw = window.localStorage.getItem(GROUPS_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<GroupsState> | null;
    if (!parsed || typeof parsed !== "object") return emptyState();
    return {
      version: 1,
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
      members: Array.isArray(parsed.members) ? parsed.members : [],
      invites: Array.isArray(parsed.invites) ? parsed.invites : [],
      activeByUser:
        parsed.activeByUser && typeof parsed.activeByUser === "object"
          ? parsed.activeByUser
          : {},
    };
  } catch {
    return emptyState();
  }
}

function writeState(state: GroupsState): void {
  if (!canUseStorage()) {
    throw new GroupError(
      "storage",
      "This browser is blocking local storage. Turn off private mode and try again."
    );
  }
  try {
    window.localStorage.setItem(GROUPS_KEY, JSON.stringify(state));
  } catch {
    throw new GroupError(
      "storage",
      "We couldn't save that change in this browser."
    );
  }
  notifyGroupsChange();
}

function notifyGroupsChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(GROUPS_EVENT));
}

export function subscribeGroups(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const onStorage = (event: StorageEvent) => {
    if (!event.key || event.key === GROUPS_KEY) listener();
  };

  window.addEventListener(GROUPS_EVENT, listener);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(GROUPS_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

function createId(prefix: string): string {
  if (typeof window !== "undefined" && "randomUUID" in window.crypto) {
    return window.crypto.randomUUID();
  }
  const bytes = new Uint8Array(12);
  if (typeof window !== "undefined") {
    window.crypto.getRandomValues(bytes);
  }
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return `${prefix}_${hex}`;
}

function withDisplayName(member: GroupMember): GroupMember {
  const account = findAccount(member.username);
  return account ? { ...member, displayName: account.displayName } : member;
}

function requireGroup(state: GroupsState, groupId: string): Group {
  const group = state.groups.find((entry) => entry.id === groupId);
  if (!group) {
    throw new GroupError("not-found", "That group no longer exists.");
  }
  return group;
}

function findMember(
  state: GroupsState,
  groupId: string,
  predicate: (member: GroupMember) => boolean
): GroupMember | undefined {
  return state.members.find(
    (member) => member.groupId === groupId && predicate(member)
  );
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export function listGroups(): Group[] {
  return getGroupsState().groups;
}

export function getGroup(id: string): Group | null {
  return getGroupsState().groups.find((group) => group.id === id) ?? null;
}

export function getMembers(groupId: string): GroupMember[] {
  return getGroupsState()
    .members.filter((member) => member.groupId === groupId)
    .map(withDisplayName)
    .sort((a, b) => {
      const rank = roleRank(b.role) - roleRank(a.role);
      if (rank !== 0) return rank;
      return a.joinedAt.localeCompare(b.joinedAt);
    });
}

export function getMember(
  groupId: string,
  userId: string
): GroupMember | null {
  const member = findMember(
    getGroupsState(),
    groupId,
    (entry) => entry.userId === userId
  );
  return member ? withDisplayName(member) : null;
}

export function getMemberByUsername(
  groupId: string,
  username: string
): GroupMember | null {
  const normalized = normalizeUsername(username);
  const member = findMember(
    getGroupsState(),
    groupId,
    (entry) => entry.username === normalized
  );
  return member ? withDisplayName(member) : null;
}

export function getOwner(groupId: string): GroupMember | null {
  const owner = findMember(
    getGroupsState(),
    groupId,
    (entry) => entry.role === "owner"
  );
  return owner ? withDisplayName(owner) : null;
}

export function countMembers(groupId: string): number {
  return getGroupsState().members.filter(
    (member) => member.groupId === groupId
  ).length;
}

export function getActiveGroupFor(
  username: string
): { group: Group; member: GroupMember } | null {
  const normalized = normalizeUsername(username);
  if (!normalized) return null;

  const state = getGroupsState();
  const memberships = state.members.filter(
    (member) => member.username === normalized
  );
  if (memberships.length === 0) return null;

  const activeId = state.activeByUser[normalized];
  const active = activeId
    ? memberships.find((member) => member.groupId === activeId)
    : undefined;

  const member =
    active ??
    [...memberships].sort((a, b) =>
      b.joinedAt.localeCompare(a.joinedAt)
    )[0];

  const group = state.groups.find((entry) => entry.id === member.groupId);
  if (!group) return null;

  return { group, member: withDisplayName(member) };
}

/**
 * Every group the user is an accepted member of. The active group comes first
 * so the list makes the current context obvious, then groups sort A-Z.
 */
export function listGroupsForUser(
  username: string
): Array<{ group: Group; member: GroupMember }> {
  const normalized = normalizeUsername(username);
  if (!normalized) return [];

  const state = getGroupsState();
  const activeId = state.activeByUser[normalized];

  return state.members
    .filter((member) => member.username === normalized)
    .map((member) => {
      const group = state.groups.find(
        (entry) => entry.id === member.groupId
      );
      return group ? { group, member: withDisplayName(member) } : null;
    })
    .filter(
      (
        item
      ): item is { group: Group; member: GroupMember } => item !== null
    )
    .sort((a, b) => {
      const aActive = a.group.id === activeId ? 0 : 1;
      const bActive = b.group.id === activeId ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return a.group.name.localeCompare(b.group.name);
    });
}

export function listInvitesForGroup(groupId: string): GroupInvite[] {
  return getGroupsState()
    .invites.filter((invite) => invite.groupId === groupId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listInvitesForUser(username: string): GroupInvite[] {
  const normalized = normalizeUsername(username);
  if (!normalized) return [];
  return getGroupsState()
    .invites.filter((invite) => invite.username === normalized)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Chapters live in their own store (`lib/chapters.ts`) and that module imports
 * groups — never the other way round. Group chapter counts are therefore summed
 * by the caller from `countChaptersForSeries`, not read from here.
 */

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export type CreateGroupInput = {
  name: string;
  ownerUsername: string;
  currency?: string;
  iconDataUrl?: string | null;
  /** Signed-in account performing the action; must be the platform admin. */
  actor: string;
};

export function createGroup(input: CreateGroupInput): Group {
  if (!isPlatformAdmin(input.actor)) {
    throw new GroupError(
      "forbidden",
      "Only the platform admin can create groups."
    );
  }

  const nameError = validateGroupName(input.name);
  if (nameError) throw new GroupError("invalid-name", nameError);
  const name = cleanGroupName(input.name);

  const currency = (input.currency ?? "USD").toUpperCase();
  if (!GROUP_CURRENCIES.includes(currency as GroupCurrency)) {
    throw new GroupError("invalid-currency", "Pick a supported currency.");
  }

  const ownerUsername = normalizeUsername(input.ownerUsername);
  const owner = ownerUsername ? findAccount(ownerUsername) : null;
  if (!owner) {
    throw new GroupError(
      "owner-not-found",
      "No account with that username. They need to register first."
    );
  }

  const iconDataUrl = input.iconDataUrl ?? null;
  if (iconDataUrl) {
    if (!iconDataUrl.startsWith("data:image/")) {
      throw new GroupError("icon-too-large", "That icon could not be read.");
    }
    if (groupIconByteSize(iconDataUrl) > MAX_GROUP_ICON_BYTES) {
      throw new GroupError(
        "icon-too-large",
        "That icon is over 100 KB after compression. Try a smaller image."
      );
    }
  }

  const state = getGroupsState();
  const now = new Date().toISOString();
  const group: Group = {
    id: createId("g"),
    name,
    slug: uniqueSlug(
      slugBase(name),
      state.groups.map((entry) => entry.slug)
    ),
    currency,
    iconDataUrl,
    createdBy: normalizeUsername(input.actor),
    createdAt: now,
  };

  const ownerMember: GroupMember = {
    id: createId("gm"),
    groupId: group.id,
    userId: owner.id,
    username: owner.username,
    displayName: owner.displayName,
    role: "owner",
    invitedBy: null,
    joinedAt: now,
  };

  writeState({
    ...state,
    groups: [group, ...state.groups],
    members: [ownerMember, ...state.members],
  });

  return group;
}

export type InviteMemberInput = {
  groupId: string;
  username: string;
  role: "manager" | "staff";
  actor: string;
};

export function inviteMember(input: InviteMemberInput): GroupInvite {
  const state = getGroupsState();
  requireGroup(state, input.groupId);

  const actorUsername = normalizeUsername(input.actor);
  const actorMember = findMember(
    state,
    input.groupId,
    (member) => member.username === actorUsername
  );
  if (!actorMember || !canManageMembers(actorMember.role)) {
    throw new GroupError(
      "forbidden",
      "Only an Owner or Manager can invite members."
    );
  }

  if (input.role !== "manager" && input.role !== "staff") {
    throw new GroupError("invalid-role", "Pick a valid role.");
  }

  if (actorMember.role === "manager" && input.role === "manager") {
    throw new GroupError(
      "forbidden",
      "Managers can add Staff. Only the Owner promotes to Manager."
    );
  }

  const inviteeUsername = normalizeUsername(input.username);
  const invitee = inviteeUsername ? findAccount(inviteeUsername) : null;
  if (!invitee) {
    throw new GroupError(
      "invitee-not-found",
      "No account with that username. They need to register first."
    );
  }

  if (
    findMember(
      state,
      input.groupId,
      (member) => member.username === inviteeUsername
    )
  ) {
    throw new GroupError(
      "already-member",
      "That person is already a member of this group."
    );
  }

  if (
    state.invites.some(
      (invite) =>
        invite.groupId === input.groupId &&
        invite.username === inviteeUsername &&
        invite.status === "pending"
    )
  ) {
    throw new GroupError(
      "already-invited",
      "There is already a pending invite for that username."
    );
  }

  const invite: GroupInvite = {
    id: createId("gi"),
    groupId: input.groupId,
    username: invitee.username,
    role: input.role,
    status: "pending",
    invitedBy: actorUsername,
    createdAt: new Date().toISOString(),
  };

  writeState({ ...state, invites: [invite, ...state.invites] });
  return invite;
}

export type ChangeRoleInput = {
  groupId: string;
  userId: string;
  role: "manager" | "staff";
  actor: string;
};

export function changeRole(input: ChangeRoleInput): void {
  const state = getGroupsState();
  requireGroup(state, input.groupId);

  const actorUsername = normalizeUsername(input.actor);
  const actorMember = findMember(
    state,
    input.groupId,
    (member) => member.username === actorUsername
  );
  if (!actorMember || !canChangeRoles(actorMember.role)) {
    throw new GroupError("forbidden", "Only the Owner can change roles.");
  }

  if (input.role !== "manager" && input.role !== "staff") {
    throw new GroupError("invalid-role", "Pick Manager or Staff.");
  }

  const target = state.members.find(
    (member) =>
      member.groupId === input.groupId && member.userId === input.userId
  );
  if (!target) {
    throw new GroupError("not-member", "That person is not a member.");
  }
  if (target.role === "owner") {
    throw new GroupError(
      "owner-immutable",
      "The Owner's role can only change through a transfer."
    );
  }
  if (target.role === input.role) return;

  writeState({
    ...state,
    members: state.members.map((member) =>
      member.id === target.id ? { ...member, role: input.role } : member
    ),
  });
}

export type RemoveMemberInput = {
  groupId: string;
  userId: string;
  actor: string;
};

export function removeMember(input: RemoveMemberInput): void {
  const state = getGroupsState();
  requireGroup(state, input.groupId);

  const actorUsername = normalizeUsername(input.actor);
  const actorMember = findMember(
    state,
    input.groupId,
    (member) => member.username === actorUsername
  );
  if (!actorMember || actorMember.role !== "owner") {
    throw new GroupError("forbidden", "Only the Owner can remove members.");
  }

  const target = state.members.find(
    (member) =>
      member.groupId === input.groupId && member.userId === input.userId
  );
  if (!target) {
    throw new GroupError("not-member", "That person is not a member.");
  }
  if (target.role === "owner") {
    throw new GroupError(
      "owner-immutable",
      "The Owner cannot be removed. Transfer ownership first."
    );
  }

  const activeByUser = { ...state.activeByUser };
  if (activeByUser[target.username] === input.groupId) {
    delete activeByUser[target.username];
  }

  writeState({
    ...state,
    members: state.members.filter((member) => member.id !== target.id),
    activeByUser,
  });
}

export type TransferOwnershipInput = {
  groupId: string;
  newOwnerId: string;
  outgoingRole: "manager" | "staff";
  actor: string;
};

export function transferOwnership(input: TransferOwnershipInput): void {
  if (!isPlatformAdmin(input.actor)) {
    throw new GroupError(
      "forbidden",
      "Only the platform admin can change a group's Owner."
    );
  }

  const state = getGroupsState();
  requireGroup(state, input.groupId);

  if (input.outgoingRole !== "manager" && input.outgoingRole !== "staff") {
    throw new GroupError("invalid-role", "Pick Manager or Staff.");
  }

  const currentOwner = findMember(
    state,
    input.groupId,
    (member) => member.role === "owner"
  );
  const nextOwner = state.members.find(
    (member) =>
      member.groupId === input.groupId && member.userId === input.newOwnerId
  );

  if (!nextOwner) {
    throw new GroupError("not-member", "That person is not a member.");
  }
  if (nextOwner.role === "owner") return;
  if (!currentOwner) {
    throw new GroupError("not-found", "This group has no Owner to transfer.");
  }

  writeState({
    ...state,
    members: state.members.map((member) => {
      if (member.id === nextOwner.id) {
        return { ...member, role: "owner" as GroupRole };
      }
      if (member.id === currentOwner.id) {
        return { ...member, role: input.outgoingRole as GroupRole };
      }
      return member;
    }),
  });
}

export type RevokeInviteInput = {
  inviteId: string;
  actor: string;
};

export function revokeInvite(inviteId: string, actor: string): void;
export function revokeInvite(input: RevokeInviteInput): void;
export function revokeInvite(
  inviteOrInput: string | RevokeInviteInput,
  maybeActor?: string
): void {
  const inviteId =
    typeof inviteOrInput === "string" ? inviteOrInput : inviteOrInput.inviteId;
  const actor =
    typeof inviteOrInput === "string" ? (maybeActor ?? "") : inviteOrInput.actor;

  const state = getGroupsState();
  const invite = state.invites.find((entry) => entry.id === inviteId);
  if (!invite) {
    throw new GroupError("invite-not-found", "That invite no longer exists.");
  }
  if (invite.status !== "pending") {
    throw new GroupError(
      "invite-not-pending",
      "That invite has already been answered."
    );
  }

  const actorUsername = normalizeUsername(actor);
  const actorMember = findMember(
    state,
    invite.groupId,
    (member) => member.username === actorUsername
  );
  if (!actorMember || !canManageMembers(actorMember.role)) {
    throw new GroupError(
      "forbidden",
      "Only an Owner or Manager can revoke invites."
    );
  }
  if (
    actorMember.role === "manager" &&
    invite.invitedBy !== actorUsername
  ) {
    throw new GroupError(
      "invite-not-yours",
      "Managers can only revoke invites they sent."
    );
  }

  writeState({
    ...state,
    invites: state.invites.map((entry) =>
      entry.id === invite.id ? { ...entry, status: "revoked" } : entry
    ),
  });
}

export function acceptInvite(inviteId: string, username: string): void {
  const state = getGroupsState();
  const invite = state.invites.find((entry) => entry.id === inviteId);
  if (!invite) {
    throw new GroupError("invite-not-found", "That invite no longer exists.");
  }
  if (invite.status !== "pending") {
    throw new GroupError(
      "invite-not-pending",
      "That invite has already been answered."
    );
  }

  const normalized = normalizeUsername(username);
  if (normalized !== invite.username) {
    throw new GroupError(
      "forbidden",
      "This invite is for a different account."
    );
  }

  const group = state.groups.find((entry) => entry.id === invite.groupId);
  if (!group) {
    throw new GroupError("not-found", "That group no longer exists.");
  }

  const existing = findMember(
    state,
    invite.groupId,
    (member) => member.username === normalized
  );

  const members = existing
    ? state.members
    : [
        ...state.members,
        {
          id: createId("gm"),
          groupId: invite.groupId,
          userId: findAccount(normalized)?.id ?? createId("u"),
          username: normalized,
          displayName: findAccount(normalized)?.displayName ?? normalized,
          role: invite.role,
          invitedBy: invite.invitedBy,
          joinedAt: new Date().toISOString(),
        } satisfies GroupMember,
      ];

  writeState({
    ...state,
    members,
    invites: state.invites.map((entry) =>
      entry.id === invite.id ? { ...entry, status: "accepted" } : entry
    ),
    // Last accepted invite wins.
    activeByUser: { ...state.activeByUser, [normalized]: invite.groupId },
  });
}

export function declineInvite(inviteId: string, username: string): void {
  const state = getGroupsState();
  const invite = state.invites.find((entry) => entry.id === inviteId);
  if (!invite) {
    throw new GroupError("invite-not-found", "That invite no longer exists.");
  }
  if (invite.status !== "pending") {
    throw new GroupError(
      "invite-not-pending",
      "That invite has already been answered."
    );
  }

  const normalized = normalizeUsername(username);
  if (normalized !== invite.username) {
    throw new GroupError(
      "forbidden",
      "This invite is for a different account."
    );
  }

  writeState({
    ...state,
    invites: state.invites.map((entry) =>
      entry.id === invite.id ? { ...entry, status: "revoked" } : entry
    ),
  });
}

export function setActiveGroup(username: string, groupId: string): void {
  const normalized = normalizeUsername(username);
  const state = getGroupsState();

  if (!findMember(state, groupId, (member) => member.username === normalized)) {
    throw new GroupError("not-member", "You are not a member of this group.");
  }

  writeState({
    ...state,
    activeByUser: { ...state.activeByUser, [normalized]: groupId },
  });
}
