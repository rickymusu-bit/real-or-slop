import { explorationRate, preferenceVersion, type PreferenceCount, type PreferenceModel } from "../shared/editorial-preferences";
import type { Env } from "./core";
export async function preferences(env: Env): Promise<PreferenceModel> {
  const [counts, observations] = await Promise.all([
    env.DB.prepare("SELECT j.value AS feature,sum(f.decision='approved') AS approved,sum(f.decision='rejected') AS rejected FROM editorial_feedback f,json_each(f.features_json) j GROUP BY j.value ORDER BY j.value").all<PreferenceCount>(),
    env.DB.prepare("SELECT count(*) AS n FROM editorial_feedback").first<{ n: number }>(),
  ]);
  return { version: preferenceVersion, observations: observations?.n || 0, exploration: explorationRate, counts: counts.results };
}
