import json
from pathlib import Path

rows = [
 ('01',4,4,4,3,'Una struttura ovale argentata con una fila di oblò è appoggiata tra alberi; richiama un veicolo spaziale collocato in un ambiente quotidiano.','La sagoma e gli oblò possono far sembrare costruita la scena; non occorre attribuire anomalie ai sostegni.','proporre', 'La struttura è in ombra e l’immagine ha definizione modesta.'),
 ('02',2,3,4,2,'Una piccola formazione irregolare arancione e verde emerge da una pianura arida, con una nube chiara sopra.','Il contrasto fra i colori della formazione e il paesaggio è curioso, ma la formazione occupa una parte molto piccola dell’inquadratura.','forse','La colorazione e la forma sono poco leggibili a dimensione telefono; non è possibile inferire la causa dei colori.'),
 ('03',4,4,3,2,'Strutture rosse allungate, con materiale scuro e lucido, emergono tra foglie e frammenti vegetali.','L’aspetto simile a tentacoli e il contrasto rosso-nero creano una scena organica insolita.','forse','Foglie sfocate e rametti coprono parte del soggetto; la sua forma complessiva è difficile da ricostruire.'),
 ('04',5,5,3,4,'Un soggetto blu e argenteo presenta varie ramificazioni sottili disposte sui lati del corpo.','La combinazione di corpo allungato, appendici a ventaglio e colore metallico ricorda una creatura immaginaria.','proporre','Il soggetto è leggibile, ma l’immagine è scura e altri esemplari sono tagliati ai bordi.'),
 ('05',4,4,4,3,'Un enorme macchinario cingolato con lunghi tralicci e una grande ruota occupa una cava.','La scala apparente e la complessità della struttura possono farla sembrare una macchina immaginaria.','proporre','La fitta struttura e le ombre rendono meno immediati i dettagli su uno schermo piccolo.'),
 ('06',4,5,4,4,'Una vasta cavità nel terreno è attraversata da numerose fiamme, con piccole figure visibili sul bordo.','Il fuoco distribuito dentro una voragine e il confronto con le figure umane evocano un paesaggio infernale.','proporre','Le zone più luminose sono bruciate e il terreno circostante è poco visibile.'),
 ('07',1,1,5,4,'Una locomotiva blu e viola con piccoli dettagli chiari si trova su binari, parzialmente coperta da una struttura.','La livrea colorata è il solo elemento leggermente inconsueto; non emerge una situazione particolarmente sorprendente.','scartare','La parte inferiore è scura e un traliccio copre una parte del mezzo.'),
 ('08',0,0,5,5,'Un battello con passeggeri passa accanto alle arcate di un ponte in pietra.','La scena è ordinaria: non si osserva un elemento chiaramente sorprendente o ingannevole.','scartare','I passeggeri sono piccoli nell’inquadratura; questo non è di per sé un indizio di generazione.'),
]
gemini=[('01',3,3,3,4,51,'forse'),('02',3,3,4,4,61,'forse'),('03',3,4,4,4,67,'proporre'),('04',3,4,3,4,60,'forse'),('05',3,3,4,4,53,'forse'),('06',3,4,4,4,70,'proporre'),('07',3,3,4,4,55,'forse'),('08',3,2,4,4,51,'forse')]
def score(d,s,p,l): return 8*d+5*s+3*p+4*l
out=[]
for row,g in zip(rows,gemini):
 i,d,s,p,l,obs,reason,decision,uncertainty=row
 gi,gd,gs,gp,gl,reported,gdecision=g
 assert i==gi and all(0<=v<=5 for v in (d,s,p,l,gd,gs,gp,gl))
 out.append({'id':i+'.jpg','osservazione_visiva':obs,'motivazione':reason,'dubbio':d,'sorpresa':s,'plausibilita':p,'leggibilita':l,'punteggio':score(d,s,p,l),'decisione_proposta':decision,'limiti_visivi':uncertainty,'gemini':{'dubbio':gd,'sorpresa':gs,'plausibilita':gp,'leggibilita':gl,'punteggio_dichiarato':reported,'punteggio_ricalcolato':score(gd,gs,gp,gl),'decisione':gdecision}})
result={'versione':'1.0.0','data':'2026-11-01','formula':'8*dubbio + 5*sorpresa + 3*plausibilita + 4*leggibilita','scala_totale':'0-100','avvertenza':'Giudizio visivo editoriale, non verifica di autenticità, provenienza o diritti. Valutazione non in cieco rispetto al testo Gemini fornito insieme alle immagini.','risultati':out}
path=Path(__file__).resolve().with_name('risultati-v1.0.0.json')
path.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for x in sorted(out,key=lambda v:(-v['punteggio'],v['id'])):
 g=x['gemini']; print(x['id'],x['punteggio'],x['decisione_proposta'],g['punteggio_dichiarato'],g['punteggio_ricalcolato'])
