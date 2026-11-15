-- The SLOP loop runs on Cloudflare (Workflow «SlopBatchWorkflow», spec generazione-slop, section 6), no longer in the browser:
-- each batch records the instance that is running it, its state and the time of its last step (heartbeat). Additive.
ALTER TABLE slop_batches ADD COLUMN runner TEXT;
ALTER TABLE slop_batches ADD COLUMN runner_status TEXT;
ALTER TABLE slop_batches ADD COLUMN runner_updated TEXT;
