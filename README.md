# Real or Slop

Un gioco: un'immagine con la sua didascalia, due possibilità. REAL (fotografia reale) o SLOP (generata con IA)?

- [Istruzioni per gli agenti](AGENTS.md) · [Mappa del sistema](MASTER.md)
- Specifica vigente: [libreria immagini, tag, didascalie e consulente SLOP](docs/libreria-immagini.v1.1.0.md)
- [Copie di gioco WebP](docs/copie-di-gioco.v2.0.0.md)

La dashboard privata (`/admin`) è una libreria di immagini gestita come un file system: caricamento multiplo
dal dispositivo o da Commons, modifica di titolo, descrizione, didascalia e tag, approvazione della copia di
gioco, pubblicazione, cestino. I documenti in `docs/` diversi da quelli elencati sono storici.

## Sviluppo

```bash
npm ci
npm run lint && npm test && npm run build
python -m pip install -r tests/requirements.txt
ROS_TEST_BROWSER=1 npm run test:integration
```
