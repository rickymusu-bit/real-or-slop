# REAL or SLOP

Aggiornato: 2026-11-14T12:00:00Z.

Un gioco educativo: per ogni foto scegli REAL (una fotografia autentica) o SLOP (un'immagine generata con l'intelligenza artificiale).
Quattro livelli, da 10 foto con 20 secondi ciascuna a 25 foto con 5 secondi; alla fine le fonti delle REAL e i prompt delle SLOP, e una
classifica.

La dashboard privata (`/admin`) ha cinque sezioni: Caricamento REAL (da Wikimedia Commons), Generazione SLOP, Database immagini,
Statistiche e Impostazioni.

## Documentazione

- [`AGENTS.md`](AGENTS.md): principi e regole di lavoro.
- [`MASTER.md`](MASTER.md): mappa del progetto, con l'elenco delle specifiche vigenti in [`docs/`](docs/).
- [`CHANGELOG.md`](CHANGELOG.md): storia delle versioni.

## Sviluppo

```bash
npm ci
```

```bash
npm run lint && npm test && npm run build && npm run dry-run
```

```bash
python -m pip install -r tests/requirements.txt
```

```bash
ROS_TEST_BROWSER=1 npm run test:integration
```

I test d'integrazione avviano un Worker locale con D1 e R2 locali e un modello OpenAI finto: non toccano le risorse remote e non fanno
chiamate a pagamento.
