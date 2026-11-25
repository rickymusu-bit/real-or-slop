/** Nightly check of the REAL sources on Wikimedia Commons (spec `libreria-immagini`, section 9; owner decisions of 2026-11-20).
 * As many photos a night as the Settings say (50 by default), each one only three months after its last check, with light requests
 * of 50 titles: does the file page still exist?
 * A Creative Commons licence cannot be revoked, so the licence is not read again; a file deleted from Commons is the signal that
 * matters, because Commons deletes mostly for copyright problems. The check only flags: it never withdraws or deletes a photo.
 * A network or API failure changes nothing and the same photos come back the next night. */
import { type Env } from "./core";
import { COMMONS_HEADERS, commonsFileTitle, commonsPageUrl } from "./commons-editorial";
import { numberSetting } from "./app-settings";

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

/** The titles of one request: Commons answers at most 50 titles per query to a client that is not a bot. */
const PER_REQUEST = 50;
type Asked = { id: string; source_url: string; title: string };
type Outcome = { checked: number; found: number; missing: number; moved: number; statements: D1PreparedStatement[] } | { skipped: string };

/** One request to Commons for up to 50 photos; nothing is written here. */
async function ask(env: Env, group: Asked[], stamp: string): Promise<Outcome> {
  let answer: Answer;
  try {
    const api = new URL(env.COMMONS_API_URL || "https://commons.wikimedia.org/w/api.php");
    for (const [key, value] of Object.entries({ action: "query", format: "json", formatversion: "2", redirects: "1", maxlag: "5",
      titles: [...new Set(group.map(g => g.title))].join("|") })) api.searchParams.set(key, value);
    const response = await fetch(api.href, { headers: COMMONS_HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) return { skipped: "Commons HTTP " + response.status };
    answer = await response.json() as Answer;
  } catch (error) {
    return { skipped: "Cannot reach Commons: " + (error instanceof Error ? error.message : String(error)) };
  }
  if (answer.error || !Array.isArray(answer.query?.pages)) return { skipped: "Unusable Commons response: " + (answer.error?.code || "no pages") };
  const normalized = new Map((answer.query!.normalized || []).map(n => [n.from, n.to]));
  const redirects = new Map((answer.query!.redirects || []).map(r => [r.from, r.to]));
  const pages = new Map(answer.query!.pages!.map(p => [p.title, p]));
  const out = { checked: 0, found: 0, missing: 0, moved: 0, statements: [] as D1PreparedStatement[] };
  for (const row of group) {
    const title = normalized.get(row.title) || row.title, target = redirects.get(title) || title, page = pages.get(target);
    if (!page || page.invalid) continue;  // not answered: the photo stays due and comes back the next night
    out.checked++;
    if (page.missing) {
      out.missing++;
      out.statements.push(env.DB.prepare("UPDATE images SET source_checked_at=?,source_missing_at=coalesce(source_missing_at,?) WHERE id=? AND source_url=?")
        .bind(stamp, stamp, row.id, row.source_url));
      continue;
    }
    out.found++;
    // A file moved on Commons leaves a redirect: the link follows it, so that the credits keep pointing at the file.
    const moved = target !== title ? commonsPageUrl(target) : null;
    if (moved) out.moved++;
    out.statements.push(env.DB.prepare(`UPDATE images SET source_checked_at=?,source_missing_at=NULL${moved ? ",source_url=?,revision=revision+1,updated_at=?" : ""}
      WHERE id=? AND source_url=?`).bind(stamp, ...(moved ? [moved, stamp] : []), row.id, row.source_url));
  }
  return out;
}

/** Checks the due photos, as many as the setting `commons_checks_per_night` says (0: paused), in requests of 50 one after the other.
 * The first failure ends the night: what was answered before is saved, the rest stays due. */
export async function checkCommonsSources(env: Env, now = Date.now(), limit?: number): Promise<CheckResult> {
  const result: CheckResult = { checked: 0, found: 0, missing: 0, moved: 0 };
  const count = limit ?? await numberSetting(env, "commons_checks_per_night");
  if (count <= 0) return { ...result, skipped: "Checks paused in Settings" };
  // Never checked (an address the owner corrected) first, then the oldest checks.
  const rows = (await env.DB.prepare(`SELECT id,source_url FROM images WHERE origin='REAL' AND status<>'trash' AND source_url LIKE ?
    AND (source_checked_at IS NULL OR source_checked_at<=?) ORDER BY source_checked_at IS NOT NULL,source_checked_at,id LIMIT ?`)
    .bind(COMMONS_PAGE, dueBefore(now), count).all<Due>()).results;
  if (!rows.length) return result;
  const stamp = new Date(now).toISOString();
  const asked: Asked[] = [], statements: D1PreparedStatement[] = [];
  for (const row of rows) {
    try { asked.push({ ...row, title: commonsFileTitle(row.source_url) }); }
    // An address that no longer reads as a Commons file cannot be asked about: it is checked and left as it is, so that it does not
    // take a place in the queue every night; the owner sees it in the detail.
    catch { statements.push(env.DB.prepare("UPDATE images SET source_checked_at=? WHERE id=? AND source_url=?").bind(stamp, row.id, row.source_url)); }
  }
  for (let i = 0; i < asked.length; i += PER_REQUEST) {
    const outcome = await ask(env, asked.slice(i, i + PER_REQUEST), stamp);
    if ("skipped" in outcome) { result.skipped = outcome.skipped; break; }
    result.checked += outcome.checked; result.found += outcome.found; result.missing += outcome.missing; result.moved += outcome.moved;
    statements.push(...outcome.statements);
  }
  if (statements.length) await env.DB.batch(statements);
  return result;
}
