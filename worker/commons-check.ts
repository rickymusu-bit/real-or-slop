/** Nightly check of the REAL sources on Wikimedia Commons (spec `libreria-immagini`, section 9; owner decision of 2026-11-20).
 * Fifty photos a night, each one only three months after its last check, with one light request: does the file page still exist?
 * A Creative Commons licence cannot be revoked, so the licence is not read again; a file deleted from Commons is the signal that
 * matters, because Commons deletes mostly for copyright problems. The check only flags: it never withdraws or deletes a photo.
 * A network or API failure changes nothing and the same photos come back the next night. */
import { type Env } from "./core";
import { COMMONS_HEADERS, commonsFileTitle, commonsPageUrl } from "./commons-editorial";

export const CHECKS_PER_NIGHT = 50;
export const CHECK_INTERVAL_MONTHS = 3;
const TIMEOUT_MS = 20_000;
const COMMONS_PAGE = "https://commons.wikimedia.org/wiki/File:%";

interface Due { id: string; source_url: string }
interface Answer {
  query?: { normalized?: { from: string; to: string }[]; redirects?: { from: string; to: string }[];
    pages?: { title: string; missing?: boolean; invalid?: boolean }[] };
  error?: { code?: string };
}
export interface CheckResult { checked: number; found: number; missing: number; moved: number; skipped?: string }

/** The moment before which a photo is due again: three calendar months before `now`. */
export function dueBefore(now: number): string {
  const date = new Date(now);
  date.setUTCMonth(date.getUTCMonth() - CHECK_INTERVAL_MONTHS);
  return date.toISOString();
}

export async function checkCommonsSources(env: Env, now = Date.now()): Promise<CheckResult> {
  const result: CheckResult = { checked: 0, found: 0, missing: 0, moved: 0 };
  // Never checked (an address the owner corrected) first, then the oldest checks.
  const rows = (await env.DB.prepare(`SELECT id,source_url FROM images WHERE origin='REAL' AND status<>'trash' AND source_url LIKE ?
    AND (source_checked_at IS NULL OR source_checked_at<=?) ORDER BY source_checked_at IS NOT NULL,source_checked_at,id LIMIT ?`)
    .bind(COMMONS_PAGE, dueBefore(now), CHECKS_PER_NIGHT).all<Due>()).results;
  if (!rows.length) return result;
  const stamp = new Date(now).toISOString();
  const titles = new Map<string, string>(), unreadable: Due[] = [];
  for (const row of rows) {
    try { titles.set(row.id, commonsFileTitle(row.source_url)); } catch { unreadable.push(row); }
  }
  const statements = [];
  // An address that no longer reads as a Commons file cannot be asked about: it is checked and left as it is, so that it does not
  // take a place in the queue every night; the owner sees it in the detail.
  for (const row of unreadable)
    statements.push(env.DB.prepare("UPDATE images SET source_checked_at=? WHERE id=? AND source_url=?").bind(stamp, row.id, row.source_url));
  if (titles.size) {
    let answer: Answer;
    try {
      const api = new URL(env.COMMONS_API_URL || "https://commons.wikimedia.org/w/api.php");
      for (const [key, value] of Object.entries({ action: "query", format: "json", formatversion: "2", redirects: "1", maxlag: "5",
        titles: [...new Set(titles.values())].join("|") })) api.searchParams.set(key, value);
      const response = await fetch(api.href, { headers: COMMONS_HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!response.ok) return { ...result, skipped: "Commons HTTP " + response.status };
      answer = await response.json() as Answer;
    } catch (error) {
      return { ...result, skipped: "Commons non raggiungibile: " + (error instanceof Error ? error.message : String(error)) };
    }
    if (answer.error || !Array.isArray(answer.query?.pages)) return { ...result, skipped: "Risposta di Commons non utilizzabile: " + (answer.error?.code || "senza pagine") };
    const normalized = new Map((answer.query!.normalized || []).map(n => [n.from, n.to]));
    const redirects = new Map((answer.query!.redirects || []).map(r => [r.from, r.to]));
    const pages = new Map(answer.query!.pages!.map(p => [p.title, p]));
    for (const row of rows) {
      const asked = titles.get(row.id);
      if (!asked) continue;
      const title = normalized.get(asked) || asked, target = redirects.get(title) || title, page = pages.get(target);
      if (!page || page.invalid) continue;  // not answered: the photo stays due and comes back the next night
      result.checked++;
      if (page.missing) {
        result.missing++;
        statements.push(env.DB.prepare("UPDATE images SET source_checked_at=?,source_missing_at=coalesce(source_missing_at,?) WHERE id=? AND source_url=?")
          .bind(stamp, stamp, row.id, row.source_url));
        continue;
      }
      result.found++;
      // A file moved on Commons leaves a redirect: the link follows it, so that the credits keep pointing at the file.
      const moved = target !== title ? commonsPageUrl(target) : null;
      if (moved) result.moved++;
      statements.push(env.DB.prepare(`UPDATE images SET source_checked_at=?,source_missing_at=NULL${moved ? ",source_url=?,revision=revision+1,updated_at=?" : ""}
        WHERE id=? AND source_url=?`).bind(stamp, ...(moved ? [moved, stamp] : []), row.id, row.source_url));
    }
  }
  if (statements.length) await env.DB.batch(statements);
  return result;
}
