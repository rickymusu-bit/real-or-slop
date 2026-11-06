import type { Env } from "./core";
import { slopLicense } from "../shared/slop-license";
export async function publishedDiagnostics(env: Env) {
  const totals = (await env.DB.prepare("SELECT i.demo,i.type,count(*) AS count FROM images i JOIN published_images p ON p.image_id=i.id GROUP BY i.demo,i.type").all()).results;
  const waiting = (await env.DB.prepare("SELECT i.type,count(*) AS count FROM images i WHERE i.status='approved' AND NOT EXISTS(SELECT 1 FROM published_images p WHERE p.image_id=i.id) GROUP BY i.type").all()).results;
  const axes = ["subject_kind","period_bucket","image_medium","composition","country_or_region","quality_bucket","perceived_plausibility","familiarity","represented_place"];
  const distributions = await Promise.all(axes.map(async axis => ({ axis, counts: (await env.DB.prepare(`SELECT i.demo,i.type,COALESCE(c.${axis},'unclassified') AS value,count(*) AS count FROM images i JOIN published_images p ON p.image_id=i.id LEFT JOIN image_curation c ON c.image_id=i.id GROUP BY i.demo,i.type,value`).all()).results })));
  const categories = (await env.DB.prepare("SELECT i.demo,i.type,ic.category_id,count(*) AS count FROM images i JOIN published_images p ON p.image_id=i.id JOIN image_categories ic ON ic.image_id=i.id GROUP BY i.demo,i.type,ic.category_id").all()).results;
  const surprise = (await env.DB.prepare("SELECT i.demo,i.type,count(c.surprise_reason) AS annotated_surprise FROM images i JOIN published_images p ON p.image_id=i.id LEFT JOIN image_curation c ON c.image_id=i.id GROUP BY i.demo,i.type").all()).results;
  const scores = (await env.DB.prepare(`WITH evaluated AS (
    SELECT i.demo,i.type,COALESCE(r.evaluation_json,json_extract(a.dossier_json,'$.evaluation')) AS evaluation
    FROM images i JOIN published_images p ON p.image_id=i.id
    LEFT JOIN editorial_image_reviews r ON r.image_id=i.id LEFT JOIN editorial_attempts a ON a.image_id=i.id
  ) SELECT demo,type,count(*) AS published_count,count(json_extract(evaluation,'$.score')) AS evaluated_count,
    avg(json_extract(evaluation,'$.score')) AS editorial_score,
    avg(json_extract(evaluation,'$.scores.authenticity_doubt')) AS authenticity_doubt,
    avg(json_extract(evaluation,'$.scores.surprise')) AS surprise,
    avg(json_extract(evaluation,'$.scores.plausibility')) AS plausibility,
    avg(json_extract(evaluation,'$.scores.game_interest')) AS game_interest,
    avg(json_extract(evaluation,'$.scores.readability')) AS readability,
    avg(json_extract(evaluation,'$.scores.concrete_motive')) AS concrete_motive
    FROM evaluated GROUP BY demo,type`).all()).results;
  const blockedSlop = await env.DB.prepare("SELECT count(*) AS count FROM images i LEFT JOIN licenses l ON l.id=i.license_id WHERE i.type='AI' AND i.status='approved' AND NOT EXISTS(SELECT 1 FROM published_images p WHERE p.image_id=i.id) AND (l.url IS NULL OR l.url!=? OR length(trim(COALESCE(i.author,'')))=0)").bind(slopLicense.url).first<{count:number}>();
  return { totals, waiting, distributions, categories, surprise, scores, slop_license_policy: {...slopLicense, blocked_waiting:blockedSlop?.count||0}, note: "Diagnostica privata descrittiva; i dati mancanti restano non classificati. Non modifica le monete indipendenti del gioco." };
}
