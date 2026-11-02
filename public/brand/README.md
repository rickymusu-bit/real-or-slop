# Asset mascotte — Botanical Elegance v1.0.0

**Tre PNG originali presenti e versionati.** Importati nel commit `c16b2a563544b9ef8bad153215b0b1855061bf84`, sono asset di brand e non immagini di catalogo o demo. SHA-256, decodifica PNG, dimensioni e canale alfa sono stati ricontrollati direttamente il 2 novembre 2026.

| Nome destinazione | Originale ricevuto | Dimensioni | SHA-256 originale |
|---|---|---|---|
| `mascot-real-slop-v1.0.0.png` | `Rane realistiche in volo rosa e verde.png` | 1254×1254 RGBA | `a19d5bf150f220d1afee2c2802d450c118d0b786d905cd29f22f74d643cf5ba4` |
| `hero-real-slop-v1.0.0.png` | `Rane incantate nella foresta pluviale.png` | 1672×941 RGB | `6beafa77b26979c34551f41a3d2b61b97de4ac87329853ee4bd8c31e612841ca` |
| `logo-real-slop-v1.0.0.png` | `Rane adorabili con ali rosa.png` | 1254×1254 RGBA | `8d92cdca9afd251e64f330e7a307025fe0c51e5fa748ad63c41cd261cdef7a8b` |

**Ripristino degli originali da un checkout incompleto:** scaricare il pacchetto ZIP consegnato nella conversazione, collocarlo nel checkout locale e avviare:

```sh
python3 scripts/import-brand-assets.py real-or-slop-brand-assets-v1.0.0.zip
git add public/brand/*.png
git commit -m "assets: add approved frog mascot, hero and logo v1.0.0"
git push origin design/botanical-elegance-v1
```

Lo script valida tutti e tre gli SHA-256 **prima** di scrivere i file. La build Vite attiva automaticamente gli elementi di brand solo quando i PNG sono identici agli originali. I tre file originali rimangono binari (non incollarli come testo). I PNG trasparenti non devono ricevere uno sfondo nero: è alfa reale, non parte del design.

**Priorità visuale:** copertina 16:9 nella home, mascotte trasparente come personaggio, logo stilizzato come brand. Le favicon `favicon-16-v1.0.0.png` (927 byte) e `favicon-32-v1.0.0.png` (2739 byte) sono derivati trasparenti separati, ottenuti dal master logo mediante downsampling Canvas 2D in Chromium. I riferimenti HTML dichiarano le dimensioni; il master rimane integro. Ispezione browser su sfondo chiaro/scuro: silhouette verde/rosa riconoscibile a 16 px, dettagli ridotti; maggiore leggibilità a 32 px. Nessun ridisegno o modifica dei master.

Specifiche complete: [identità visiva](../../docs/identita-visiva-botanical-elegance-v1.0.0.md).

**Non pubblicare** come fotografie REAL del catalogo o come parte della generazione casuale del gioco.
