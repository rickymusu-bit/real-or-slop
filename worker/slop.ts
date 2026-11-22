/** Routes of the SLOP wizard: exceptions to see, the batch of the wizard (auto/...) and the review of a batch. */
import { HttpError, type Env } from "./core";
import { acceptProcess, attention, batchRoute, closeProcess } from "./slop-generation";
import { autoRoute } from "./slop-auto";

export async function slopRoute(env: Env, method: string, path: string, data: Record<string, unknown>, gallery = "") {
  if (path === "state" && method === "GET") return {attention: await attention(env, gallery)};
  if (path === "attention" && method === "GET") return {attention: await attention(env)};
  const closing = /^processes\/([\w-]{1,64})\/close$/.exec(path);
  if (closing && method === "POST") return closeProcess(env, closing[1], data);
  const accepting = /^processes\/([\w-]{1,64})\/accept$/.exec(path);
  if (accepting && method === "POST") return acceptProcess(env, accepting[1], data);
  if (path === "auto" || path.startsWith("auto/")) return autoRoute(env, method, path.slice("auto".length).replace(/^\//, ""), data, gallery);
  if (path.startsWith("batches/")) return batchRoute(env, method, path.slice("batches/".length));
  throw new HttpError(404, "API dello studio SLOP inesistente");
}

