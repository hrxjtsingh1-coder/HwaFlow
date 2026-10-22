/**
 * Server-side glossary reads.
 *
 * RLS exposes terms to anyone who can view the series; the RPCs enforce that
 * only Owner/Manager or an assigned Staff member can change them.
 */

import "server-only";

import type {
  GlossaryCategory,
  GlossaryOrigin,
  GlossaryStatus,
  GlossaryTerm,
} from "../glossary";
import { createClient } from "../supabase/server";

type GlossaryRow = {
  id: string;
  series_id: string;
  source_term: string;
  target_term: string;
  category: GlossaryCategory;
  origins: string[] | null;
  status: GlossaryStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function originOf(origins: string[] | null): GlossaryOrigin {
  return origins?.includes("manual") ? "manual" : "auto";
}

export function mapGlossaryRow(row: GlossaryRow): GlossaryTerm {
  return {
    id: row.id,
    seriesId: row.series_id,
    sourceTerm: row.source_term,
    targetTerm: row.target_term,
    category: row.category,
    origin: originOf(row.origins),
    status: row.status,
    chapterId: null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listGlossaryTerms(
  seriesId: string,
  options?: { includeDismissed?: boolean }
): Promise<GlossaryTerm[]> {
  const supabase = await createClient();
  const includeDismissed = options?.includeDismissed ?? false;

  let query = supabase
    .from("glossary_terms")
    .select(
      "id, series_id, source_term, target_term, category, origins, status, created_by, created_at, updated_at"
    )
    .eq("series_id", seriesId);

  if (!includeDismissed) query = query.eq("status", "active");

  const { data, error } = await query.order("source_term", {
    ascending: true,
  });

  if (error) {
    throw new Error(`[glossary:list] ${error.message}`);
  }

  return ((data ?? []) as unknown as GlossaryRow[]).map(mapGlossaryRow);
}

export async function getGlossaryTerm(
  termId: string
): Promise<GlossaryTerm | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("glossary_terms")
    .select(
      "id, series_id, source_term, target_term, category, origins, status, created_by, created_at, updated_at"
    )
    .eq("id", termId)
    .maybeSingle();

  if (error) throw new Error(`[glossary:get] ${error.message}`);
  if (!data) return null;

  return mapGlossaryRow(data as unknown as GlossaryRow);
}
