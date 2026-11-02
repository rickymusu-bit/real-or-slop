# Asset mascotte — Botanical Elegance v1.0.0

**Percorsi riservati — file binari ancora da aggiungere.** Questa cartella documenta le tre illustrazioni approvate; non sostituire immagini di catalogo o demo.

| Nome destinazione | Originale ricevuto | Dimensioni | SHA-256 originale |
|---|---|---|---|
| `mascot-real-slop-v1.0.0.png` | `Rane realistiche in volo rosa e verde.png` | 1254×1254 RGBA | `a19d5bf150f220d1afee2c2802d450c118d0b786d905cd29f22f74d643cf5ba4` |
| `hero-real-slop-v1.0.0.png` | `Rane incantate nella foresta pluviale.png` | 1672×941 RGB | `6beafa77b26979c34551f41a3d2b61b97de4ac87329853ee4bd8c31e612841ca` |
| `logo-real-slop-v1.0.0.png` | `Rane adorabili con ali rosa.png` | 1254×1254 RGBA | `8d92cdca9afd251e64f330e7a307025fe0c51e5fa748ad63c41cd261cdef7a8b` |

**Importazione automatica verificata:** scaricare il pacchetto ZIP consegnato nella conversazione, collocarlo nel checkout locale e avviare:

```sh
python3 scripts/import-brand-assets.py real-or-slop-brand-assets-v1.0.0.zip
git add public/brand/*.png
git commit -m "assets: add approved frog mascot, hero and logo v1.0.0"
git push origin design/botanical-elegance-v1
```

Lo script valida tutti e tre gli SHA-256 **prima** di scrivere i file. La build Vite attiva automaticamente gli elementi di brand solo quando i PNG sono identici agli originali. I tre file originali rimangono binari (non incollarli come testo). I PNG trasparenti non devono ricevere uno sfondo nero: è alfa reale, non parte del design.

**Priorità visuale:** copertina 16:9 nella home, mascotte trasparente come personaggio, logo stilizzato come brand. Per favicon 16/32 px valutare separatamente una versione ulteriormente semplificata.

Specifiche complete: [identità visiva](../../docs/identita-visiva-botanical-elegance-v1.0.0.md).

**Non pubblicare** come fotografie REAL del catalogo o come parte della generazione casuale del gioco.
