/** Automatic composition suggestions. They are preferences, never an acceptance criterion. */
const preferences = [
  "Choose a straight-on view. A single subject against a plain or quiet background is welcome.",
  "Try a natural angle from the left if it suits the scene, with as few elements as the scene needs.",
  "A centred, symmetrical framing is welcome. A frontal view or a subject looking towards the camera may suit it.",
  "Let the photographic genre and scene guide the viewpoint, framing and number of subjects.",
  "Try a natural angle from the right if it suits the scene. Keep the background simple where appropriate.",
  "Choose a frontal perspective if it suits the scene. A simple head-on view can work for a person, an object, a building or a landscape.",
];

export function compositionAt(sequence: number): string {
  const index = ((sequence % preferences.length) + preferences.length) % preferences.length;
  return `Optional composition preference: ${preferences[index]} Use a viewpoint and arrangement that suit the scene. Treat any reference framing as incidental. Do not add extra people, objects or background detail merely for variety. Compose for the whole photograph.`;
}
