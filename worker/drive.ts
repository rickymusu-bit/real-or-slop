import { HttpError } from "./core";

// This is private provenance data: never return file IDs in public game APIs.
export interface DriveArchive {
  fileId: string;
  manifestId: string;
  sha256: string;
}
export function parseDriveArchive(value: unknown): DriveArchive | null {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new HttpError(400, "Riferimento Drive non valido");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(",") !== "file_id,manifest_id,sha256")
    throw new HttpError(400, "Campi archivio Drive non validi");
  const fileId = record.file_id, manifestId = record.manifest_id, sha256 = record.sha256;
  const validId = (id: unknown) => typeof id === "string" && /^[a-zA-Z0-9_-]{10,200}$/.test(id);
  if (!validId(fileId) || !validId(manifestId) || typeof sha256 !== "string" || !/^[0-9a-f]{64}$/.test(sha256))
    throw new HttpError(400, "ID Drive o SHA-256 non validi");
  if (fileId === manifestId) throw new HttpError(400, "Originale e scheda Drive devono essere file diversi");
  return { fileId: fileId as string, manifestId: manifestId as string, sha256 };
}
