import licenses from "./licenses.json";

export interface LicenseIdentity {
  url: string;
  name: string;
}

// Resolve only published CC identities. HTTP, www and translated deed/legalcode
// links name the same license; never change its version or jurisdiction.
export function recognizedLicense(value: unknown): LicenseIdentity | null {
  if (typeof value !== "string" || value.length > 500) return null;
  const match = /^https?:\/\/(?:www\.)?creativecommons\.org(\/[^\s?#%\\]*)$/i.exec(value.trim());
  if (!match) return null;
  const path = match[1].replace(/\/(?:deed|legalcode)(?:\.[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*)?\/?$/i, "/");
  const url = "https://creativecommons.org" + path.replace(/\/?$/, "/");
  const name = (licenses as Record<string, string>)[url];
  return name ? { url, name } : null;
}
