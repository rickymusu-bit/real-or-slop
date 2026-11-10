# Real or Slop

Un gioco: un'immagine con la sua didascalia, due possibilità. REAL (fotografia reale) o SLOP (generata con IA)?

- [Istruzioni per gli agenti](AGENTS.md) · [Mappa del sistema](MASTER.md)
- Specifica vigente: [libreria immagini, tag, didascalie e consulente SLOP](docs/libreria-immagini.v1.8.0.md)
- [Copie di gioco WebP](docs/copie-di-gioco.v2.0.0.md)

La dashboard privata (`/admin`) ha quattro sezioni: **Caricamento REAL** (wizard Commons → tag e
didascalie → riepilogo e pubblicazione), **Generazione SLOP** (in preparazione), **Database immagini** e
**Impostazioni**. La libreria mantiene la gestione dei file, la revisione, l'approvazione e il cestino.
Specifiche del nuovo flusso: [wizard REAL v1.3.1](docs/dashboard-admin-wizard-real.v1.3.1.md).
Le altre specifiche in `docs/` sono storiche, salvo le eccezioni richiamate in `AGENTS.md`.

## Sviluppo

```bash
npm ci
npm run lint && npm test && npm run build
python -m pip install -r tests/requirements.txt
ROS_TEST_BROWSER=1 npm run test:integration
```
