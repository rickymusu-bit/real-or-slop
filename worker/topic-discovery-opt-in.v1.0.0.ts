/** Owner-only persisted Topic Discovery opt-in, v1.0.0.
 * Switching this setting never invokes GPT, embeddings or other APIs.
 * It gates only proactive topic suggestions; manual topics and their photo flows stay usable.
 */
import { HttpError, type Env } from "./core";

export async function topicDiscoveryEnabled(env: Env): Promise<boolean> {
  const row=await env.DB.prepare("SELECT enabled FROM editorial_topic_discovery_settings WHERE singleton_id=1")
    .first<{enabled:number}>();
  if(!row)throw new HttpError(503,"Configurazione Topic Discovery non disponibile: migrazione 0021 necessaria");
  return row.enabled===1;
}

export async function setTopicDiscoveryEnabled(env: Env, enabled: boolean): Promise<void> {
  const updated=await env.DB.prepare(
    "UPDATE editorial_topic_discovery_settings SET enabled=?,updated_at=? WHERE singleton_id=1"
  ).bind(enabled?1:0,new Date().toISOString()).run();
  if(updated.meta.changes!==1)
    throw new HttpError(503,"Impossibile salvare la preferenza Topic Discovery");
}
