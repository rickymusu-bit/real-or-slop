export const ADMIN_VIEWS = [
  { id: "overview", label: "Panoramica", description: "Stato del catalogo e operazioni da completare." },
  { id: "topics", label: "Argomenti", description: "Nuovi argomenti, memoria semantica e Topic Discovery." },
  { id: "production", label: "Produzione immagini", description: "Proposte, ricerca REAL, generazione SLOP e diagnostica editoriale." },
  { id: "review", label: "Revisione", description: "Valutazione delle immagini e verifiche di ammissione." },
  { id: "publication", label: "Pubblicazione", description: "Bilanciamento REAL/SLOP e pubblicazione dei cicli." },
  { id: "settings", label: "Impostazioni", description: "Modalità delle partite, budget e controlli amministrativi." },
] as const;

export type AdminView = (typeof ADMIN_VIEWS)[number]["id"];

export function resolveAdminView(value: string | null | undefined): AdminView {
  return ADMIN_VIEWS.find(item => item.id === value)?.id ?? "overview";
}
