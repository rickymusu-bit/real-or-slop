/** Size asked to the image generator (docs/copie-di-gioco.v3.0.0.md, section 4). v1.0.0, 2026-11-12T08:00:00Z.
 * Game copies are 4:5. The GPT Image 2.5 and 2.6 models accept custom sizes (multiples of 16, ratio between 1:3 and 3:1,
 * OpenAI images reference read on 2026-11-11), so they generate 1024×1280 directly. The other models offer only the standard
 * sizes: they generate 1024×1536 (2:3) and the 4:5 frame is cut from it, losing about a sixth of the height. To be confirmed
 * on the first real call: the server checks the size of what it receives anyway. */
export const PORTRAIT_4X5 = "1024x1280", PORTRAIT_2X3 = "1024x1536";
export const generationSize = (model: string) => /^gpt-image-2\.[56]-/.test(model) ? PORTRAIT_4X5 : PORTRAIT_2X3;
