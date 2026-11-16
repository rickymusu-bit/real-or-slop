// Unit tests run the Worker's modules in Node, which has no «cloudflare:workers»: this hook resolves it to a minimal stand-in
// (only the base class of the Workflow, never run by the unit tests). The integration tests use the real runtime (wrangler dev).
import { register } from "node:module";
register("data:text/javascript," + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier === "cloudflare:workers")
    return { shortCircuit: true, url: "data:text/javascript," + encodeURIComponent("export class WorkflowEntrypoint { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }") };
  return next(specifier, context);
}`));
