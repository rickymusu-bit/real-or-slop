/** Automatic composition suggestions rotate independently across horizontal placement and gaze.
 * They are preferences, never a credibility criterion or a reason for another paid attempt. */
export function compositionAt(sequence: number): string {
  const index = ((sequence % 9) + 9) % 9;
  const positions = ["near the centre", "towards the right side", "towards the left side"];
  const directions = ["towards the camera or frontally", "towards the left", "towards the right"];
  return `Composition preference: distribute the main visual weight ${positions[index % 3]}. If a person or animal naturally has a direction, orient it ${directions[(Math.floor(index / 3) + index % 3) % 3]}. For landscapes, objects or crowds without a meaningful gaze, ignore the gaze preference. Preserve a natural photographic scene; do not invent a person or force a pose to satisfy this suggestion. Do not copy the reference's placement, gaze, viewpoint or arrangement. Never compose for a later crop.`;
}
