"use server";

/**
 * Group mutations.
 *
 * All writes go through the SECURITY DEFINER RPCs from the groups migration;
 * this module only validates shape, maps SQLSTATEs to the app's failure names,
 * and handles the one Storage side effect (the group icon).
 *
 * Errors are returned as data. A thrown server-action error is replaced by a
 * generic message in production, which would hide "that username is already
 * invited" from the user.
 */

import type { Group, GroupFailure, GroupRole } from "./groups";
import {
  GROUP_CURRENCIES,
  validateGroupName,
  type GroupCurrency,
} from "./groups";
import type { AuthUser } from "./identity";
import { getViewer } from "./session";
import {
  mapGroup,
  type GroupRow,
} from "./server/groups";
import { signedUrlFor } from "./server/storage";
import { createClient } from "./supabase/server";

/* ------------------------------------------------------------------ */
/* Result shape                                                        */
/* ------------------------------------------------------------------ */

export type GroupActionFailureCode = GroupFailure | "signed-out";

export type GroupActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: GroupActionFailureCode; message: string };

type DbError = { code?: string; message?: string } | null;

const SQLSTATE: Record<string, GroupFailure> = {
  HF001: "forbidden",
  HF002: "not-found",
  HF003: "already-member",
  HF004: "already-invited",
  HF005: "invitee-not-found",
  HF006: "invalid-role",
  HF007: "owner-immutable",
  HF008: "invite-not-pending",
  HF009: "invite-not-yours",
  HF010: "invalid-name",
  HF011: "invalid-currency",
  HF012: "not-member",
};

function failure(
  code: GroupActionFailureCode,
  message: string
): GroupActionResult<never> {
  return { ok: false, code, message };
}

function fromDbError(
  error: DbError,
  fallback = "Something went wrong. Try again."
): GroupActionResult<never> {
  if (!error) return failure("unknown", fallback);

  const mapped =
    (error.code ? SQLSTATE[error.code] : undefined) ??
    (error.code === "42501" ? "forbidden" : undefined);

  return failure(mapped ?? "unknown", error.message || fallback);
}

async function requireViewer(): Promise<
  { ok: true; viewer: AuthUser } | { ok: false; result: GroupActionResult<never> }
> {
  const viewer = await getViewer();
  if (!viewer) {
    return {
      ok: false,
      result: failure(
        "signed-out",
        "Your session expired. Sign in again to continue."
      ),
    };
  }
  return { ok: true, viewer };
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

const MAX_ICON_BYTES = 100 * 1024;

/**
 * Decodes the compressed icon the drawer already produced. Only WebP and PNG
 * are accepted, matching the bucket's MIME allow-list. An unreadable icon is
 * dropped rather than failing the group creation.
 */
function decodeIcon(
  dataUrl: string
): { bytes: Uint8Array; contentType: string } | null {
  const match = /^data:(image\/(?:webp|png));base64,([A-Za-z0-9+/=]+)$/.exec(
    dataUrl
  );
  if (!match) return null;

  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(Buffer.from(match[2], "base64"));
  } catch {
    return null;
  }

  if (bytes.byteLength === 0 || bytes.byteLength > MAX_ICON_BYTES) return null;
  return { bytes, contentType: match[1] };
}

/**
 * Creates the group and its Owner, then uploads the optional icon.
 *
 * The icon is a second step by necessity: its path contains the group id,
 * which does not exist until `create_group` returns. A failed upload leaves a
 * valid group with no icon; it never rolls the group back.
 */
export async function createGroupAction(
  formData: FormData
): Promise<GroupActionResult<Group>> {
  const auth = await requireViewer();
  if (!auth.ok) return auth.result;

  if (!auth.viewer.isPlatformAdmin) {
    return failure("forbidden", "Only the platform admin can create groups.");
  }

  const name = String(formData.get("name") ?? "");
  const currency = String(formData.get("currency") ?? "USD").toUpperCase();
  const ownerId = String(formData.get("ownerId") ?? "");
  const icon = String(formData.get("icon") ?? "");

  const nameError = validateGroupName(name);
  if (nameError) return failure("invalid-name", nameError);

  if (!GROUP_CURRENCIES.includes(currency as GroupCurrency)) {
    return failure("invalid-currency", "Pick a supported currency.");
  }

  if (!UUID.test(ownerId)) {
    return failure(
      "invitee-not-found",
      "No account with that username. They need to register first."
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("create_group", {
    p_name: name,
    p_currency: currency,
    p_owner_id: ownerId,
  });

  if (error || !data) return fromDbError(error, "We couldn't create that group.");

  const row = data as unknown as GroupRow;
  let iconUrl: string | null = null;
  const decoded = icon ? decodeIcon(icon) : null;

  if (decoded) {
    const path = `${row.id}/icon.webp`;
    const { error: uploadError } = await supabase.storage
      .from("group-icons")
      .upload(path, decoded.bytes, {
        contentType: decoded.contentType,
        upsert: true,
      });

    if (!uploadError) {
      const { error: iconError } = await supabase.rpc("set_group_icon", {
        p_group_id: row.id,
        p_path: path,
      });

      if (iconError) {
        // Best-effort cleanup: no row points at the object.
        await supabase.storage.from("group-icons").remove([path]);
      } else {
        iconUrl = await signedUrlFor(supabase, "group-icons", path);
      }
    }
  }

  return { ok: true, data: mapGroup(row, iconUrl) };
}

/* ------------------------------------------------------------------ */
/* Invites                                                             */
/* ------------------------------------------------------------------ */

function validRole(role: string): role is "manager" | "staff" {
  return role === "manager" || role === "staff";
}

export async function inviteMemberAction(input: {
  groupId: string;
  userId: string;
  role: "manager" | "staff";
}): Promise<GroupActionResult<null>> {
  const auth = await requireViewer();
  if (!auth.ok) return auth.result;

  if (!UUID.test(input.groupId) || !UUID.test(input.userId)) {
    return failure("not-found", "That group or account no longer exists.");
  }
  if (!validRole(input.role)) {
    return failure("invalid-role", "Pick Manager or Staff.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("invite_group_member", {
    p_group_id: input.groupId,
    p_user_id: input.userId,
    p_role: input.role,
  });

  if (error) return fromDbError(error, "We couldn't send that invite.");
  return { ok: true, data: null };
}

export async function acceptInviteAction(
  inviteId: string
): Promise<GroupActionResult<{ groupId: string }>> {
  const auth = await requireViewer();
  if (!auth.ok) return auth.result;

  if (!UUID.test(inviteId)) {
    return failure("invite-not-found", "That invite no longer exists.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_group_invite", {
    p_invite_id: inviteId,
  });

  if (error || !data) {
    return fromDbError(error, "That invite is no longer available.");
  }

  const member = data as unknown as { group_id: string };
  return { ok: true, data: { groupId: member.group_id } };
}

export async function declineInviteAction(
  inviteId: string
): Promise<GroupActionResult<null>> {
  const auth = await requireViewer();
  if (!auth.ok) return auth.result;

  if (!UUID.test(inviteId)) {
    return failure("invite-not-found", "That invite no longer exists.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("decline_group_invite", {
    p_invite_id: inviteId,
  });

  if (error) return fromDbError(error, "That invite is no longer available.");
  return { ok: true, data: null };
}

export async function revokeInviteAction(
  inviteId: string
): Promise<GroupActionResult<null>> {
  const auth = await requireViewer();
  if (!auth.ok) return auth.result;

  if (!UUID.test(inviteId)) {
    return failure("invite-not-found", "That invite no longer exists.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_group_invite", {
    p_invite_id: inviteId,
  });

  if (error) return fromDbError(error, "We couldn't revoke that invite.");
  return { ok: true, data: null };
}

/* ------------------------------------------------------------------ */
/* Membership                                                          */
/* ------------------------------------------------------------------ */

export async function changeRoleAction(input: {
  groupId: string;
  userId: string;
  role: "manager" | "staff";
}): Promise<GroupActionResult<null>> {
  const auth = await requireViewer();
  if (!auth.ok) return auth.result;

  if (!UUID.test(input.groupId) || !UUID.test(input.userId)) {
    return failure("not-member", "That person is not a member.");
  }
  if (!validRole(input.role)) {
    return failure("invalid-role", "Pick Manager or Staff.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("change_group_member_role", {
    p_group_id: input.groupId,
    p_user_id: input.userId,
    p_role: input.role,
  });

  if (error) return fromDbError(error, "We couldn't change that role.");
  return { ok: true, data: null };
}

export async function removeMemberAction(input: {
  groupId: string;
  userId: string;
}): Promise<GroupActionResult<null>> {
  const auth = await requireViewer();
  if (!auth.ok) return auth.result;

  if (!UUID.test(input.groupId) || !UUID.test(input.userId)) {
    return failure("not-member", "That person is not a member.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_group_member", {
    p_group_id: input.groupId,
    p_user_id: input.userId,
  });

  if (error) return fromDbError(error, "We couldn't remove that member.");
  return { ok: true, data: null };
}

/**
 * Platform-admin ownership transfer. Not wired to a surface in Phase 1 (the
 * admin detail page is deferred), but the RPC and action exist together so the
 * detail page can call it without another migration.
 */
export async function transferOwnershipAction(input: {
  groupId: string;
  userId: string;
  outgoingRole: Exclude<GroupRole, "owner">;
}): Promise<GroupActionResult<null>> {
  const auth = await requireViewer();
  if (!auth.ok) return auth.result;

  if (!auth.viewer.isPlatformAdmin) {
    return failure(
      "forbidden",
      "Only the platform admin can change a group's Owner."
    );
  }

  if (!UUID.test(input.groupId) || !UUID.test(input.userId)) {
    return failure("not-member", "That person is not a member.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_group_ownership", {
    p_group_id: input.groupId,
    p_user_id: input.userId,
    p_outgoing_role: input.outgoingRole,
  });

  if (error) return fromDbError(error, "We couldn't transfer ownership.");
  return { ok: true, data: null };
}
