/**
 * Pure decision function for engine job authorization.
 *
 * Kept free of `server-only`, Supabase and Next imports so it can be unit
 * tested directly. Default behaviour is deliberately fail-OPEN on an RPC
 * error: a transient Postgres blip should not blank the whole review panel.
 * Set ENGINE_STRICT_ACCESS=1 to require positive proof instead.
 */

export type EngineAccessDecision = "allow" | "deny" | "allow-unverified";

export function decideEngineAccess(
  allowed: boolean | null,
  roleError: { message: string } | null,
  strict = false
): EngineAccessDecision {
  if (strict) {
    // Strict mode needs positive proof: true, with no RPC error.
    return allowed === true && !roleError ? "allow" : "deny";
  }
  if (roleError) return "allow-unverified";
  if (allowed === false) return "deny";
  return "allow";
}
