/**
 * Chapter title normalisation for the editor.
 *
 * `update_chapter_details` reads `p_title is null` as "leave the title alone"
 * and `p_title = ''` as "clear it". The editor used to send `value || null`,
 * which turned an emptied field into "leave it alone" — so a title could never
 * be removed and the save looked successful while the old title came back.
 */

/** Trim the draft. An empty result means "clear the title", not "no change". */
export function titlePayload(raw: string): string {
  return raw.trim();
}
