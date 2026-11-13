/** Browser-side game copy (docs/copie-di-gioco.v5.0.0.md). v3.1.0, 2026-11-13T19:00:00Z: no 4:5 initial view any more (owner
 * decision of 2026-11-13): saving «Inquadratura» makes a new copy only when the crop changed, otherwise nothing is sent.
 * Encoding and upload are those of src/game-copy.v3.0.0.ts, re-exported here; the «view» argument of prepareLibraryCopy is no
 * longer used by the dashboard and the Worker ignores it. */
import { prepareLibraryCopy } from "./game-copy.v3.0.0";
import type { Crop } from "../shared/game-copy.v3.0.0";
export { encodeGameCopy, originalOf, prepareLibraryCopy } from "./game-copy.v3.0.0";

/** Saves the owner's choice from the frame editor: a new copy when the crop changed; the same item when it did not. */
export async function saveFrame<T>(item: T & { id: string; copy: { crop: Crop | null } | null }, choice: { crop: Crop }): Promise<T> {
  const same = item.copy?.crop && JSON.stringify(item.copy.crop) === JSON.stringify(choice.crop);
  return same ? item : prepareLibraryCopy<T>(item.id, undefined, choice.crop);
}
