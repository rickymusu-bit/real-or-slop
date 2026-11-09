import { api, escape } from "./main";
import { prepareGameCopy } from "./game-copy.v1.0.0";

export interface CycleCard {
  id: string; sha256: string; revision: number; origin: string; status: string;
  publication?: { image_id: string; cycle_id: string; published: boolean } | null;
  details: { title?: string; author?: string; source_url?: string; license_url?: string; original_key?: string; cycle_id?: string };
}
export function admissionForm(image: CycleCard, categories: {id:string;name:string}[]) {
  if (image.publication?.published) return '<p>Pubblicata nel catalogo bilanciato. Il voto è conservato nello storico.</p>';
  if (image.status !== "approved" || !image.details.original_key) return "";
  return `<details><summary>Verifica origine e diritti per il gioco</summary><p>L’approvazione visiva è già registrata. Completa questa verifica separata prima della pubblicazione.</p>${image.publication ? '<p>Ammissione precedente conservata nello storico.</p>' : ''}<form id="cycle-admission"><label>Ciclo<input name="cycle_id" required maxlength="100" value="${escape(image.details.cycle_id || image.publication?.cycle_id || 'owner-review')}"></label><label>Titolo<input name="title" required maxlength="300" value="${escape((image.details.title || '').slice(0,300))}"></label><label>Autore / responsabile della generazione<input name="author" required maxlength="300" value="${escape(image.details.author || '')}"></label><label>Pagina della fonte<input name="source_url" required type="url" maxlength="1000" value="${escape(image.details.source_url || '')}"></label><label>Licenza verificata<input name="license_url" required type="url" maxlength="500" value="${escape(image.details.license_url || '')}"></label><label>Prove di origine e obblighi della licenza<textarea name="evidence" required maxlength="4000" rows="3"></textarea></label><label>Spiegazione da mostrare dopo la risposta<textarea name="explanation" required maxlength="4000" rows="3"></textarea></label><label>Categorie<select name="categories" multiple required>${categories.map(c => `<option value="${escape(c.id)}">${escape(c.name)}</option>`).join('')}</select></label><label><input name="rights_confirmed" type="checkbox" required> Ho verificato i diritti e gli obblighi della licenza</label><label><input name="authenticity_confirmed" type="checkbox" required> Ho verificato l’origine ${image.origin === 'REAL' ? 'fotografica reale' : 'interamente sintetica'} dell’immagine</label>${image.origin === 'AI' ? '<label><input name="owner_declaration" type="checkbox" required> Confermo di poter pubblicare questa generazione con la licenza indicata</label>' : ''}<button type="button" id="cycle-admit">Ammetti al catalogo privato</button></form></details>`;
}
/** Returns false when the form is invalid, "admitted" on full success, or a warning when only the game copy failed. */
export async function submitAdmission(form: HTMLFormElement, image: CycleCard): Promise<false | string> {
  if (!form.reportValidity()) return false;
  const values = new FormData(form), data: Record<string,unknown> = {
    inbox_id:image.id, revision:image.revision, sha256:image.sha256,
    categories:values.getAll('categories'), rights_confirmed:values.has('rights_confirmed'),
    authenticity_confirmed:values.has('authenticity_confirmed'),
  };
  for (const key of ['cycle_id','title','author','source_url','license_url','evidence','explanation']) data[key] = String(values.get(key) || '').trim();
  if (image.origin === 'AI') data.owner_declaration = values.has('owner_declaration');
  const admitted = await api<{image_id:string}>('/admin/editorial/cycle/admit',{method:'POST',body:JSON.stringify(data)});
  // The uniform WebP game copy is made right away in this browser; if it fails, the publication panel offers it again.
  try { await prepareGameCopy(image.id, admitted.image_id); return "admitted"; }
  catch (error) { return "Ammessa, ma la copia di gioco non è pronta: " + (error instanceof Error ? error.message : "errore") + ". Riprova da «Pubblicazione del ciclo»."; }
}
export const publicationControls = `<details><summary>Pubblicazione del ciclo</summary><p>Pubblica lo stesso numero di REAL e SLOP già approvate e ammesse. Le eccedenze restano in attesa. Si pubblicano solo immagini con la copia di gioco WebP uniforme, preparata in questo browser.</p><label>Ciclo<input id="publication-cycle" maxlength="100"></label><button id="cycle-state">Controlla disponibilità</button><button id="cycle-copies">Prepara le copie di gioco mancanti</button><button id="cycle-publish">Pubblica le immagini ammesse in numero uguale</button><pre id="cycle-state-result" aria-live="polite"></pre></details>`;
interface Missing { image_id: string; inbox_id: string; type: string }
/** Prepares, one at a time, the game copies the cycle still lacks. */
export async function prepareMissingCopies(page: HTMLElement) {
  const cycle = page.querySelector<HTMLInputElement>('#publication-cycle')!.value.trim();
  if (!/^[\w-]{1,100}$/.test(cycle)) throw new Error('Indica il ciclo.');
  const output = page.querySelector<HTMLElement>('#cycle-state-result')!;
  const { missing_game_copies: missing = [] } = await api<{missing_game_copies?:Missing[]}>('/admin/editorial/cycle?cycle_id='+encodeURIComponent(cycle));
  let done = 0; const failed: string[] = [];
  for (const item of missing) {
    output.textContent = `Copie di gioco: ${done}/${missing.length}…`;
    try { await prepareGameCopy(item.inbox_id, item.image_id); done++; }
    catch (error) { failed.push(error instanceof Error ? error.message : 'errore'); }
  }
  output.textContent = missing.length ? `Copie di gioco preparate: ${done}/${missing.length}.` + (failed.length ? ' Errori: ' + [...new Set(failed)].join('; ') : '') : 'Nessuna copia di gioco mancante.';
}
export async function cyclePublication(page: HTMLElement, publish: boolean) {
  const cycle = page.querySelector<HTMLInputElement>('#publication-cycle')!.value.trim();
  if (!/^[\w-]{1,100}$/.test(cycle)) throw new Error('Indica il ciclo da controllare o pubblicare.');
  const result = await api<{published?:boolean;per_origin?:number;ready?:{type:string;count:number}[];missing_game_copies?:Missing[]}>(
    '/admin/editorial/cycle'+(publish ? '/publish' : '?cycle_id='+encodeURIComponent(cycle)),
    publish ? {method:'POST',body:JSON.stringify({cycle_id:cycle,confirm:true})} : undefined);
  const ready = (origin:string) => result.ready?.find(r => r.type === origin)?.count || 0;
  page.querySelector<HTMLElement>('#cycle-state-result')!.textContent = publish ?
    (result.published ? `Pubblicate ${result.per_origin} REAL e ${result.per_origin} SLOP.` : 'Nessuna nuova pubblicazione. Servono REAL e SLOP ammesse in entrambe le origini.') :
    `${ready('REAL')} REAL e ${ready('AI')} SLOP ammesse in attesa.` + (result.missing_game_copies?.length ?
      ` ${result.missing_game_copies.length} senza copia di gioco: prepararle prima di pubblicare.` : ` Pubblicabili: ${Math.min(ready('REAL'),ready('AI'))} per origine, se hanno almeno un tag.`);
}
