import { body, hash, HttpError, id, json, type Env, type GameCatalogMode } from "./core";

interface ModeRow { mode: GameCatalogMode; revision: number; updated_at: string }
export interface CatalogModeSnapshot {
  mode: GameCatalogMode;
  revision: number;
  updatedAt: string;
  published: { REAL: number; AI: number };
  canActivateProduction: boolean;
}
async function snapshot(env: Env): Promise<CatalogModeSnapshot> {
  const [control, inventory] = await Promise.all([
    env.DB.prepare("SELECT mode,revision,updated_at FROM game_catalog_control WHERE id=1").first<ModeRow>(),
    env.DB.prepare("SELECT i.type,count(*) AS total FROM images i JOIN published_images p ON p.image_id=i.id WHERE i.demo=0 AND i.status='approved' GROUP BY i.type").all<{ type: string; total: number }>(),
  ]);
  if (!control || !["demo","production"].includes(control.mode))
    throw new HttpError(503, "Controllo del catalogo non inizializzato");
  const published = { REAL: 0, AI: 0 };
  for (const row of inventory.results) {
    if (row.type === "REAL" || row.type === "AI") published[row.type] = Number(row.total);
  }
  return {
    mode: control.mode, revision: control.revision, updatedAt: control.updated_at, published,
    canActivateProduction: !!env.IMAGES && published.REAL > 0 && published.AI > 0,
  };
}
export async function gameCatalogModeAdmin(request: Request, env: Env): Promise<Response> {
  if (request.method === "GET") return json(await snapshot(env));
  if (request.method !== "POST") throw new HttpError(405, "Metodo non consentito");
  const input = await body(request, 1200);
  if (Object.keys(input).sort().join(",") !== "confirm,mode,revision" ||
      (input.mode !== "demo" && input.mode !== "production") ||
      !Number.isSafeInteger(input.revision) || (input.revision as number) < 0 || input.confirm !== true)
    throw new HttpError(400, "Modalità, revisione e conferma esplicita richieste");
  const before = await snapshot(env), desired = input.mode as GameCatalogMode;
  if (before.revision !== input.revision) throw new HttpError(409, "Impostazione modificata in un'altra scheda. Ricarica.");
  if (before.mode === desired) return json(before);
  if (desired === "production" && !before.canActivateProduction)
    throw new HttpError(409, "La produzione richiede R2 e almeno una REAL e una SLOP pubblicate.");
  const stamp = new Date().toISOString(), uid = id(), actor = (await hash(env.ADMIN_TOKEN || "")).slice(0, 12);
  // D1 batch is a single transaction; CAS and append-only audit move together.
  const results = await env.DB.batch([
    env.DB.prepare(`UPDATE game_catalog_control SET mode=?,revision=revision+1,updated_at=?
      WHERE id=1 AND revision=? AND mode<>?
        AND (?='demo' OR (
          (SELECT count(*) FROM images i JOIN published_images p ON p.image_id=i.id
           WHERE i.demo=0 AND i.status='approved' AND i.type='REAL')>0
          AND (SELECT count(*) FROM images i JOIN published_images p ON p.image_id=i.id
           WHERE i.demo=0 AND i.status='approved' AND i.type='AI')>0
        ))`).bind(desired,stamp,before.revision,desired,desired),
    env.DB.prepare(`INSERT INTO game_catalog_mode_events(id,previous_mode,mode,revision,actor,created_at)
      SELECT ?,?,?,revision,?,? FROM game_catalog_control WHERE id=1 AND mode=? AND revision=?`)
      .bind(uid,before.mode,desired,actor,stamp,desired,before.revision+1),
  ]);
  if (!results[0].meta.changes || !results[1].meta.changes)
    throw new HttpError(409, "Modalità non modificata: catalogo o revisione cambiati. Ricarica.");
  return json(await snapshot(env));
}
