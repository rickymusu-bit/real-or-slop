/** Display names only: REAL keep their title; SLOP use their immutable identifier. */
export const imageLabel = (image: {id: string; origin: string; title?: string | null}) =>
  image.origin === "REAL" && image.title ? image.title : `${image.origin} ${image.id.slice(0, 8)}`;
