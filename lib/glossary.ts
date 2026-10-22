/**
 * Glossary shapes and validation.
 *
 * Storage moved to Supabase (`public.glossary_terms`). Scope is the series, not
 * the chapter, which is what keeps "Jihun" from becoming "Jihoon" in chapter 4.
 *
 * Provenance is part of the contract: a human-added term is `manual` and the
 * pipeline may never overwrite it. Auto-detected terms are `auto`, dismissible,
 * and excluded from prompts once dismissed.
 */

export type GlossaryOrigin = "auto" | "manual";
export type GlossaryCategory =
  | "character"
  | "place"
  | "honorific"
  | "item"
  | "term";
export type GlossaryStatus = "active" | "dismissed";

export const GLOSSARY_CATEGORIES: GlossaryCategory[] = [
  "character",
  "place",
  "honorific",
  "item",
  "term",
];

export const GLOSSARY_CATEGORY_LABEL: Record<GlossaryCategory, string> = {
  character: "Character",
  place: "Place",
  honorific: "Honorific",
  item: "Item",
  term: "Term",
};

export type GlossaryTerm = {
  id: string;
  seriesId: string;
  sourceTerm: string;
  targetTerm: string;
  category: GlossaryCategory;
  origin: GlossaryOrigin;
  status: GlossaryStatus;
  chapterId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GlossaryFailure =
  | "not-found"
  | "forbidden"
  | "invalid-term"
  | "duplicate-term"
  | "storage"
  | "unknown";

export class GlossaryError extends Error {
  code: GlossaryFailure;

  constructor(code: GlossaryFailure, message?: string) {
    super(message ?? code);
    this.name = "GlossaryError";
    this.code = code;
  }
}

export const MAX_TERM_LENGTH = 60;

/** Collapse whitespace and trim, matching `clean_term()` in the migration. */
export function cleanTerm(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Case-insensitive identity of a term, matching the unique index. */
export function termKey(value: string): string {
  return cleanTerm(value).toLocaleLowerCase();
}
