export type GalleryWizard = "real" | "slop";

export function galleryPhotosPath(id: string, batch = "") {
  const query = new URLSearchParams({ gallery: id });
  if (batch) query.set("batch", batch);
  return "/admin?" + query;
}

export function galleryWizardPath(id: string, wizard: GalleryWizard) {
  return `/admin/gallerie/${encodeURIComponent(id)}/${wizard}`;
}
