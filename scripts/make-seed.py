"""Only synthetic test data: never a verified REAL catalog."""
from pathlib import Path
import hashlib
import uuid
categories = {'storia': ('Storia',['antichita','novecento']), 'arte': ('Arte',['pittura','scultura']), 'ingegneria': ('Ingegneria civile',['ponti','viadotti','dighe']), 'architettura': ('Architettura',['edifici','monumenti']), 'automobili': ('Automobili',['classiche','moderne']), 'trasporti': ('Macchine e trasporti',['treni','navi','aerei','robot']), 'scienza': ('Scienza e spazio',['astronomia','ricerca']), 'cinema': ('Cinema e spettacolo',['film','teatro'])}
def q(s): return "'"+str(s).replace("'","''")+"'"
lines=["-- Demo sintetica: etichette simulate, nessuna prova di autenticità."]
for key,(name,children) in categories.items():
    lines.append(f"INSERT OR IGNORE INTO categories VALUES({q(key)},{q(name)},NULL);")
    for child in children: lines.append(f"INSERT OR IGNORE INTO categories VALUES({q(key+'-'+child)},{q(child.capitalize())},{q(key)});")
lines.append("INSERT OR IGNORE INTO licenses VALUES('demo','Fixture originale','https://creativecommons.org/publicdomain/zero/1.0/','Solo illustrazioni sintetiche del progetto');")
for i in range(24):
    uid=str(uuid.uuid5(uuid.NAMESPACE_URL,f'ros-fixture-{i}'))
    values=[uid,'REAL' if i%2==0 else 'AI',f'Scenario {i+1}','Illustrazione geometrica sintetica','Real or Slop', 'Demo: etichetta simulata; nessun documento storico.',str(uuid.uuid5(uuid.NAMESPACE_DNS,uid)), 'fixture-renderer' if i%2 else None,'Paesaggio geometrico dimostrativo' if i%2 else None,['facile','medio','difficile'][(i//2)%3],hashlib.sha256(uid.encode()).hexdigest(), 'Questa è una fixture sintetica. La risposta è simulata per provare il gioco, non certifica un’immagine reale o generata con IA.']
    cols='id,type,title,description,author,authenticity_evidence,r2_key,ai_model,ai_prompt,difficulty,sha256,explanation'
    lines.append(f"INSERT OR IGNORE INTO images({cols},license_id,status,rights_verified_at,demo) VALUES({','.join('NULL' if v is None else q(v) for v in values)},'demo','approved','2026-10-25',1);")
    category=list(categories)[i//3%8]
    lines.append(f"INSERT OR IGNORE INTO image_categories VALUES({q(uid)},{q(category)});")
    lines.append(f"INSERT OR IGNORE INTO image_categories VALUES({q(uid)},{q(category+'-'+categories[category][1][0])});")
Path('scripts/seed.sql').write_text('\n'.join(lines)+'\n')
