import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDriveArchive } from "../worker/drive.ts";

const example = {
  file_id: "DriveOriginalFile_01",
  manifest_id: "DriveMetadataFile_01",
  sha256: "a".repeat(64),
};
test("Drive provenance accepted as private metadata; optional for manual imports", () => {
  assert.equal(parseDriveArchive(undefined), null);
  assert.deepEqual(parseDriveArchive(example), {
    fileId: example.file_id, manifestId: example.manifest_id, sha256: example.sha256,
  });
});
test("Drive provenance rejects malformed IDs, uppercase SHA, and injected fields", () => {
  for (const value of [
    {}, "invalid", { ...example, file_id: "../escape" },
    { ...example, manifest_id: example.file_id },
    { ...example, sha256: "A".repeat(64) },
    { ...example, public_url: "https://drive.google.com/file/secret" },
  ]) assert.throws(() => parseDriveArchive(value));
});
