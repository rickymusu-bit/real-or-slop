/** Real Worker/D1/R2 with a fail-closed fake outbound service. Never reads real API keys. */
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import {URL,URLSearchParams} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawnSync,spawn} from 'node:child_process';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

const token='fixture-admin-token-never-used-remotely-000064';
const calls=[];
let searchMode='success',embeddingMode='success',descriptionMode='success',suggestionMode='standard',imageSequence=0;
const images=JSON.parse(spawnSync('python3',['-c',`import io,json,base64
from PIL import Image
out={}
for name,size,color in [('owner',(240,360),'blue'),('owner-link',(240,360),'cyan'),('owner-link-mobile',(240,360),'magenta'),('commons',(480,320),'red'),('lot-canal',(300,200),'teal'),('1536x1024',(1536,1024),'green'),('1024x1536',(1024,1536),'yellow'),('1024x1024',(1024,1024),'purple')]:
 b=io.BytesIO();Image.new('RGB',size,color).save(b,'WEBP');out[name]=base64.b64encode(b.getvalue()).decode()
for name,orientation,color in [('geometry-probe',6,'orange'),('legacy-desktop',6,'pink'),('legacy-mobile',8,'cyan'),('geometry-invalid',9,'gray')]:
 b=io.BytesIO();exif=Image.Exif();exif[274]=orientation;Image.new('RGB',(240,120),color).save(b,'JPEG',exif=exif);out[name]=base64.b64encode(b.getvalue()).decode()
print(json.dumps(out))`],{encoding:'utf8'}).stdout);
const photo=name=>Buffer.from(images[name],'base64');
const reply=value=>globalThis.Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]});
const plausible={coherent:true,specific:true,photographically_plausible:true,reason:'An understandable subject with photographically plausible visible activity.'};
const topics=[
 {title:'Brussels agricultural protests in 2026',description:'Farmers demonstrating in Brussels during 2026.',rationale:'A distinct later episode.'},
 {title:'Farm demonstrations Brussels 2024',description:'Agricultural workers protesting in Brussels in 2024.',rationale:'A paraphrase of the historical topic.'},
 {title:'Night work in coastal fish markets',description:'Fish vendors preparing coastal markets before sunrise.',rationale:'A photographically feasible new perspective.'}
].map(t=>({...t,assessment:plausible}));
const nonsense={title:'Invisible arithmetic sleeps outside time',description:'A literal photograph of an abstract calculation sleeping outside time.',rationale:'Far from the catalog is not a reason to recommend it.',assessment:{...plausible,coherent:false,photographically_plausible:false,reason:'No coherent photographic subject.'}};
const result=await build({entryPoints:['worker/index.ts'],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
const mf=new Miniflare(convertV4MiniflareOptions({host:'127.0.0.1',port:0,inspectorPort:0,workers:[{name:'editorial-fixture',modules:true,script:result.outputFiles[0].text,compatibilityDate:'2026-10-25',
 d1Databases:{DB:'editorial-enabled-fixture'},r2Buckets:['QUARANTINE','IMAGES'],
 assets:{directory:'dist',binding:'ASSETS',routerConfig:{has_user_worker:true},run_worker_first:['/api/*','/admin','/admin/*'],assetConfig:{not_found_handling:'single-page-application'}},
 bindings:{ADMIN_TOKEN:token,DATA_MODE:'demo',OPENAI_API_KEY:'fixture-not-a-real-key',WORKSPACE_AI_ENABLED:'true',EDITORIAL_BUDGET_RESET_USD:'5',
  ENABLE_REAL_DISCOVERY_PAID:'true',ENABLE_EDITORIAL_CYCLE_GENERATION:'true',
  REAL_DISCOVERY_MODEL:'gpt-6.1-terra',REAL_DISCOVERY_CALL_USD:'0.01',REAL_DISCOVERY_RUN_USD:'2',
  REAL_DISCOVERY_DAILY_USD:'10',REAL_DISCOVERY_TOTAL_USD:'10',REAL_DISCOVERY_MAX_CALLS:'100',
  EDITORIAL_CYCLE_IMAGE_MODEL:'fixture-image',EDITORIAL_CYCLE_GENERATION_USD:'0.05',EDITORIAL_CYCLE_MAX_GENERATIONS:'8',
  TOPIC_EMBEDDING_CALL_USD:'0.00001',TOPIC_EMBEDDING_DAILY_USD:'10',TOPIC_EMBEDDING_TOTAL_USD:'10'},
 outboundService:async request=>{
  const url=new URL(request.url);calls.push({url:request.url,body:request.method==='POST'?await request.json():null});
  const data=calls.at(-1).body;
  if(url.hostname==='api.openai.com'){
   if(url.pathname==='/v1/embeddings'){
    if(embeddingMode==='uncertain')return globalThis.Response.json({error:'uncertain'},{status:503});
    assert.equal(data.dimensions,1536);
    const vector=data.input.includes('Remote incoherent proposal')?[0,1,...Array(1534).fill(0)]:[1,...Array(1535).fill(0)];
    return globalThis.Response.json({model:'text-embedding-3-small',data:[{index:0,embedding:vector}],usage:{total_tokens:24}});
   }
   if(url.pathname==='/v1/images/generations'){
    assert.equal(data.n,1);assert.ok(!JSON.stringify(data).includes('OWNER_REAL_SECRET'));
    const [w,h]=data.size.split('x').map(Number);
    imageSequence++;
    const generated=spawnSync('python3',['-c',`import io,base64
from PIL import Image
b=io.BytesIO();Image.new('RGB',(${w},${h}),(${imageSequence*61%255},${imageSequence*103%255},${imageSequence*37%255})).save(b,'WEBP');print(base64.b64encode(b.getvalue()).decode())`],{encoding:'utf8'}).stdout.trim();
    return globalThis.Response.json({data:[{b64_json:generated}]});
   }
   assert.equal(url.pathname,'/v1/responses');
   assert.equal(data.store,false);
   const name=data.text.format.name;
   if(name==='topic_description'){
    assert.ok(data.input[0].content.includes('Never invent places, dates'));
    if(descriptionMode==='uncertain')return globalThis.Response.json({error:'uncertain'},{status:503});
    if(descriptionMode==='invalid')return reply({description:'x'.repeat(501),ambiguity:''});
    return reply({description:'An open photographic topic whose specific place, period and participants have not been supplied.',ambiguity:'The title does not establish a location, date or particular event.'});
   }
   if(name==='topic_suggestions'){
    assert.ok(data.input[0].content.includes('never arbitrary vectors or empty regions'));
    if(suggestionMode==='empty')return reply({suggestions:[{title:'Workers opening a morning market',description:'Visible preparations for an ordinary market day.',rationale:'A plausible subject before any corpus exists.',assessment:plausible},
      {title:'Bicycle repairs on neighborhood streets',description:'People repairing bicycles on neighborhood streets.',rationale:'A different everyday activity.',assessment:plausible}]});
    if(suggestionMode==='allbad')return reply({suggestions:[nonsense]});
    if(suggestionMode==='remote')return reply({suggestions:[{...nonsense,title:'Remote incoherent proposal',assessment:plausible}]});
    if(suggestionMode==='invalid')return reply({suggestions:[{...nonsense,title:'Incomplete model assessment proposal',assessment:{...plausible,coherent:'true'}}]});
    if(suggestionMode==='uncertain')return reply({suggestions:[{...topics[2],title:'A new topic with an uncertain review'}]});
    if(suggestionMode==='invalid_review')return reply({suggestions:[{...topics[2],title:'Incomplete second review proposal'}]});
    return reply({suggestions:[...topics,nonsense]});
   }
   if(name==='topic_duplicate_checks'){
    const comparisons=JSON.parse(data.input[1].content[0].text);
    assert.ok(data.input[0].content.startsWith('First review coherence'));
    if(suggestionMode==='empty')assert.ok(comparisons.every(c=>c.neighbors.length===0 && c.batch_neighbors.length===1));
    if(suggestionMode==='standard')assert.ok(comparisons.every(c=>c.neighbors.some(n=>n.title==='Brussels agricultural protests in 2024')));
    if(suggestionMode==='uncertain')return globalThis.Response.json({error:'review uncertain'},{status:503});
    if(suggestionMode==='invalid_review')return reply({decisions:comparisons.map(c=>({id:c.id,eligible:'true',duplicate:false,reason:'Malformed response must not admit a candidate.'}))});
    return reply({decisions:comparisons.map(c=>({id:c.id,eligible:suggestionMode!=='remote',duplicate:c.title==='Farm demonstrations Brussels 2024',reason:suggestionMode==='remote'?'An incoherent topic is not useful merely because it is distant.':c.title.includes('2026')?'Distinct year and episode':'Same topic paraphrased or new subject'}))});
   }
   if(name==='commons_queries'){
    assert.ok(!JSON.stringify(data.input).includes('SEMANTIC_DESCRIPTION_SENTINEL'));
    return reply({queries:['fixture successful query','fixture second query']});
   }
   if(name==='visual_profile'){
    assert.ok(!JSON.stringify(data.input).includes('OWNER_REAL_SECRET'),'Pixel-only model received title/metadata');
    return reply({subject:'Blue facade',action:'No visible action',setting:'Exterior',composition:'Portrait framing',visibility:'Clearly visible facade',interest:'Geometric patterns',tags:['blue_facade','geometry','architecture']});
   }
   if(name==='topic_relevance')return reply({match:'mismatch',reason:'A facade is visible, with no protesting people.'});
   if(name==='slop_prompts'){
    assert.ok(!JSON.stringify(data.input).includes('OWNER_REAL_SECRET'));
    assert.ok(!JSON.stringify(data.input).includes('blue_facade'));
    assert.ok(!JSON.stringify(data.input).includes('SEMANTIC_DESCRIPTION_SENTINEL'));
    return reply({prompts:Array.from({length:8},(_,i)=>`Original synthetic editorial photograph variant ${i}, a natural candid scene with ambient daylight and a visible setting.`)});
   }
   throw Error('Unexpected model task: '+name);
  }
  if(url.hostname==='commons.wikimedia.org' || url.hostname==='upload.wikimedia.org')
   assert.match(request.headers.get('user-agent') || '',/^RealOrSlop\/[\d.]+ \(https:\/\//,'Wikimedia requires an identifying User-Agent');
  if(url.hostname==='commons.wikimedia.org'){
   const generator=url.searchParams.get('generator'),list=url.searchParams.get('list');
   // Lot browsing (spec lotti 1.4.0): files and categories are separate requests, as the real API requires.
   if(generator && list===generator)throw Error('Commons module used as both generator and list: '+generator);
   if(generator==='search' || generator==='categorymembers'){
    if((url.searchParams.get('gsrsearch')||'').startsWith('commons down'))return new globalThis.Response('fixture failure',{status:503});
    if(generator==='search'){
     assert.ok(url.searchParams.get('gsrsearch').endsWith(' filetype:bitmap'));
     if(url.searchParams.get('gsrsearch').startsWith('newest'))assert.equal(url.searchParams.get('gsrsort'),'create_timestamp_desc');
    }
    const thumb=n=>'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cc/'+n+'/400px-'+n;
    const page=(title,index,thumburl,width=3000)=>({title,index,categories:[{title:'Category:Canals of Venice'},{title:'Category:'+title.slice(5)}],
     imageinfo:[{thumburl,url:'https://upload.wikimedia.org/wikipedia/commons/c/cc/'+title.slice(5).replace(/ /g,'_'),width,height:2000,
     extmetadata:{Artist:{value:'<a href="https://example.org">Fixture <b>author</b></a>'},LicenseShortName:{value:'CC BY-SA 4.0'},
      ImageDescription:{value:'Gondolas <i>at dusk</i>'},DateTimeOriginal:{value:'2024-05-01'}}}]});
    const pages=[page('File:Canal B.jpg',2,thumb('Canal_B.jpg'),900),page('File:Canal A.jpg',1,thumb('Canal_A.jpg')),
     page('File:Clip.ogv',3,thumb('Clip.ogv')),page('File:Hostile.jpg',4,'https://example.org/x.jpg')];
    return globalThis.Response.json({query:{pages},continue:generator==='search'?{gsroffset:30,continue:'gsroffset||'}:{gcmcontinue:'file|NEXT',continue:'gcmcontinue||'}});
   }
   if(list==='search' && url.searchParams.get('srnamespace')==='14')
    return globalThis.Response.json({query:{search:[{title:'Category:Canals of Venice'},{title:'File:Not a category.jpg'}]}});
   if(list==='categorymembers' && url.searchParams.get('cmtype')==='subcat')
    return globalThis.Response.json({query:{categorymembers:[{title:'Category:Canal Grande'}]}});
   if(url.searchParams.get('titles')==='File:Lot_canal.jpg' || url.searchParams.get('titles')==='File:Lot canal.jpg'){
    return globalThis.Response.json({query:{pages:[{title:'File:Lot canal.jpg',imageinfo:[{url:'https://upload.wikimedia.org/wikipedia/commons/c/cc/Lot_canal.webp',
     width:300,height:200,size:photo('lot-canal').length,extmetadata:{Artist:{value:'Fixture author'},LicenseUrl:{value:'https://creativecommons.org/licenses/by/4.0/'},
     ImageDescription:{value:'Gondolas on a <i>canal</i>'},Categories:{value:'Canals of Venice|Gondolas'},DateTimeOriginal:{value:'2024-05-01'}}}]}]}});
   }
   if(url.searchParams.get('list')==='search'){
    if(searchMode==='failed' || searchMode==='partial' && url.searchParams.get('srsearch').includes('second'))return new globalThis.Response('fixture failure',{status:503});
    return globalThis.Response.json({query:{search:searchMode==='empty'?[]:[{title:'File:Fixture.jpg'}]}});
   }
   const requestedFile=url.searchParams.get('titles');
   const ownerMobile=requestedFile==='File:OwnerLinkMobile.jpg';
   const ownerLink=requestedFile==='File:OwnerLinkDesktop.jpg' || ownerMobile;
   return globalThis.Response.json({query:{pages:[{title:ownerLink?(ownerMobile?'File:OwnerLinkMobile.jpg':'File:OwnerLinkDesktop.jpg'):'File:Fixture.jpg',imageinfo:[{url:ownerLink?('https://upload.wikimedia.org/wikipedia/commons/a/ab/'+(ownerMobile?'OwnerLinkMobile.webp':'OwnerLink.webp')):'https://upload.wikimedia.org/wikipedia/commons/a/ab/Fixture.webp',
    width:ownerLink?240:480,height:ownerLink?360:320,size:photo(ownerMobile?'owner-link-mobile':ownerLink?'owner-link':'commons').length,
    extmetadata:{Artist:{value:'Fixture author'},LicenseUrl:{value:'https://creativecommons.org/licenses/by/4.0/'}}}]}]}});
  }
  if(url.hostname==='upload.wikimedia.org' && url.pathname.endsWith('/Lot_canal.webp'))return new globalThis.Response(photo('lot-canal'),{headers:{'Content-Type':'image/webp'}});
  if(url.hostname==='upload.wikimedia.org')return new globalThis.Response(photo(url.pathname.endsWith('/OwnerLinkMobile.webp')?'owner-link-mobile':url.pathname.endsWith('/OwnerLink.webp')?'owner-link':'commons'),{headers:{'Content-Type':'image/webp'}});
  throw Error('External network forbidden in fixtures: '+url.hostname);
 }
}]}));
try{
 const base=String(await mf.ready),db=await mf.getD1Database('DB');
 // D1 exec accepts complete SQL; migrations are exactly the repository migrations.
 const statements=JSON.parse(spawnSync('python3',['-c',`import sqlite3,json
from pathlib import Path
out=[]
for path in sorted(Path('migrations').glob('*.sql')):
 current=''
 for char in path.read_text():
  current+=char
  if char==';' and sqlite3.complete_statement(current):out.append(current);current=''
print(json.dumps(out))`],{encoding:'utf8'}).stdout);
 for(const statement of statements)await db.prepare(statement).run();
 await db.prepare("INSERT INTO categories VALUES('fixture','Fixture',NULL)").run();
 async function api(path,data,expected=200){
  const response=await fetch(new URL('/api/admin/'+path,base),{headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   ...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})});
  const value=await response.json();assert.ok([expected].flat().includes(response.status),response.status+': '+JSON.stringify(value));return value;
 }
 const ws='editorial/workspace',intel='editorial/intelligence';
 assert.equal((await api(intel)).topic_discovery_enabled,false);
 assert.deepEqual((await api(intel)).topic_memory,{topics:0,indexed_topics:0,proposals:0,owner_reviewed_proposals:0,quality_validated:false,coverage_validated:false});
 suggestionMode='empty';await api(intel+'/topic-discovery/settings',{enabled:true});
 const emptyOp=globalThis.crypto.randomUUID();
 const emptyRuns=await Promise.all([0,1].map(()=>api(intel+'/suggest',{operation_id:emptyOp},[200,409])));
 const emptyResult=emptyRuns.find(r=>r.suggested===2);assert.ok(emptyResult);assert.equal(emptyResult.compared_records,0);
 const firstProposals=(await api(intel)).suggestions;
 assert.ok(firstProposals.every(s=>s.assessment_status==='eligible' && s.novelty===null && JSON.parse(s.neighbors_json).length===0));
 const emptyCalls=calls.length;
 await api(intel+'/suggest',{operation_id:emptyOp});assert.equal(calls.length,emptyCalls);
 await api(intel+'/topic-discovery/settings',{enabled:false});suggestionMode='standard';
 // Lots (spec lotti 1.3.1, phase 1): no model call, Commons browsing and selected metadata at acquisition.
 const lotCalls=calls.length;
 const lot=await api(ws+'/lots',{title:'Fixture lot canals',notes:'Only canals.'},201);
 assert.equal(lot.lot_revision,1);assert.equal(calls.length,lotCalls,'Creating a lot must not call a model');
 const found=await api(ws+'/commons/search?q='+encodeURIComponent('venice canals'));
 assert.deepEqual(found.files.map(f=>f.title),['File:Canal A.jpg','File:Canal B.jpg']);
 assert.equal(found.files[0].page_url,'https://commons.wikimedia.org/wiki/File:Canal_A.jpg');
 assert.equal(found.files[0].author,'Fixture author');assert.equal(found.files[0].license,'CC BY-SA 4.0');
 assert.equal(found.files[0].preview_url,'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cc/Canal_A.jpg/1280px-Canal_A.jpg');
 assert.equal(found.files[1].preview_url,'https://upload.wikimedia.org/wikipedia/commons/c/cc/Canal_B.jpg','small originals preview themselves');
 assert.equal(found.files[0].description,'Gondolas at dusk');assert.equal(found.files[0].date,'2024-05-01');
 const newest=await api(ws+'/commons/search?sort=recent&q='+encodeURIComponent('newest canals'));assert.equal(newest.files.length,2);
 await api(ws+'/commons/search?sort=random&q=venice',undefined,400);
 const page2=await api(ws+'/commons/search?offset=30&q=venice');assert.deepEqual(page2.categories,[]);
 assert.deepEqual(found.categories,['Category:Canals of Venice']);assert.equal(found.next,'30');
 await api(ws+'/commons/search?q=x',undefined,400);
 await api(ws+'/commons/search?q=venice&offset=abc',undefined,400);
 await api(ws+'/commons/search?q='+encodeURIComponent('commons down'),undefined,502);
 const category=await api(ws+'/commons/category?name='+encodeURIComponent('Category:Canals_of_Venice'));
 assert.deepEqual(category.categories,['Category:Canal Grande']);assert.equal(category.next,'file|NEXT');
 await api(ws+'/commons/category?name='+encodeURIComponent('Bad|name'),undefined,400);
 const added=await api(ws+'/links/batch',{topic_id:lot.id,source_urls:['https://upload.wikimedia.org/wikipedia/commons/c/cc/Lot_canal.jpg']},201);
 assert.equal(added.saved,1);
 const lotProposal=(await api(ws)).proposals.find(p=>p.topic_id===lot.id);
 assert.equal(lotProposal.source_url,'https://commons.wikimedia.org/wiki/File:Lot_canal.jpg');
 const acquired=await api(intel+'/acquire',{proposal_id:lotProposal.id},[200,201]);
 const lotMeta=JSON.parse((await db.prepare('SELECT metadata_json FROM editorial_review_inbox WHERE id=?').bind(acquired.inbox_id).first()).metadata_json);
 assert.equal(lotMeta.topic_id,lot.id);assert.deepEqual(lotMeta.provenance.commons_categories,['Canals of Venice','Gondolas']);
 assert.equal(lotMeta.provenance.commons_date,'2024-05-01');
 await api(ws+'/proposals/'+lotProposal.id+'/dismiss',{},409);
 assert.ok(calls.slice(lotCalls).every(c=>/^https:\/\/(commons|upload)\.wikimedia\.org\//.test(c.url)),'Browsing and acquiring Commons must not call a model');
 const originalCalls=calls.length;
 const original=await api(ws+'/topics',{title:'Brussels agricultural protests in 2024',description:'Agricultural workers demonstrating in Brussels during 2024.'},201);
 assert.equal(original.embedding_status,'ready');assert.equal(calls.length,originalCalls+1);
 await api(ws+'/topics',{title:'Brussels agricultural protests in 2024'},200);assert.equal(calls.length,originalCalls+1);
 const legacyId=globalThis.crypto.randomUUID();
 await db.prepare("INSERT INTO editorial_workspace_topics VALUES(?,?,?,?)").bind(legacyId,'An old unindexed owner topic','an old unindexed owner topic','2024').run();
 const pendingCalls=calls.length;
 const indexed=await Promise.all([0,1].map(()=>api(ws+'/topics/'+legacyId+'/semantics',{description:'A historical owner topic.',expected_sha256:null},[200,409])));
 assert.ok(indexed.some(r=>r.embedding_status==='ready'));
 assert.equal(calls.length,pendingCalls+1,'Concurrent backfill must embed once');
 const prior=(await api(ws)).topics.find(t=>t.id===original.id);
 await api(ws+'/topics/'+original.id+'/semantics',{description:'Farmers protesting in Brussels in 2024, during a specific episode.',expected_sha256:prior.input_sha256});
 assert.equal((await db.prepare('SELECT count(*) AS n FROM editorial_topic_semantic_history').first()).n,1);
 await api(ws+'/topics/'+original.id+'/semantics',{description:'A stale overwrite',expected_sha256:prior.input_sha256},409);
 const revised=(await api(ws)).topics.find(t=>t.id===original.id),beforeRestore=calls.length;
 await api(ws+'/topics/'+original.id+'/semantics',{description:'Agricultural workers demonstrating in Brussels during 2024.',expected_sha256:revised.input_sha256});
 assert.equal(calls.length,beforeRestore,'Restoring an archived vector must not bill again');
 embeddingMode='uncertain';
 const uncertain=await api(ws+'/topics',{title:'Uncertain provider receipt topic',description:'A fixture testing uncertain embedding receipts.'},201);
 assert.equal(uncertain.embedding_status,'uncertain');
 const uncertainRow=(await api(ws)).topics.find(t=>t.id===uncertain.id),before=calls.length;
 await api(ws+'/topics/'+uncertain.id+'/semantics',{description:'',expected_sha256:uncertainRow.input_sha256},409);
 assert.equal(calls.length,before);embeddingMode='success';
 await api(intel+'/suggest',{operation_id:globalThis.crypto.randomUUID()},409);
 await api(intel+'/topic-discovery/settings',{enabled:true});
 const operation_id=globalThis.crypto.randomUUID();
 assert.equal((await api(intel+'/suggest',{operation_id})).suggested,2);
 const suggestions=(await api(intel)).suggestions;
 assert.equal(suggestions.find(s=>s.title===topics[0].title).screening_status,'ready');
 assert.equal(suggestions.find(s=>s.title===topics[1].title).screening_status,'duplicate');
 const excluded=suggestions.find(s=>s.title===nonsense.title);
 assert.equal(excluded.assessment_status,'ineligible');assert.equal(excluded.embedding_status,null);
 assert.equal(excluded.status,'suggested','A model exclusion must not become an owner rejection');
 await api(intel+'/suggestions/'+excluded.id+'/decision',{decision:'accepted'},409);
 assert.ok(!calls.some(c=>c.url.endsWith('/embeddings') && c.body.input.includes(nonsense.title)));
 await api(intel+'/suggestions/'+suggestions.find(s=>s.title===topics[1].title).id+'/decision',{decision:'accepted'},409);
 const selected=suggestions.find(s=>s.title===topics[0].title);
 await api(intel+'/suggestions/'+selected.id+'/decision',{decision:'accepted'});
 const accepted=(await api(ws)).topics.find(t=>t.title===selected.title);
 assert.equal(accepted.description,topics[0].description);assert.equal(accepted.embedding_status,'ready');
 const cachedCalls=calls.length;await api(intel+'/suggest',{operation_id});assert.equal(calls.length,cachedCalls);
 const memory=(await api(intel)).topic_memory;
 assert.equal(memory.owner_reviewed_proposals,1);assert.equal(memory.quality_validated,false);assert.equal(memory.coverage_validated,false);
 for(const mode of ['allbad','remote','invalid','uncertain','invalid_review']){
  suggestionMode=mode;const op=globalThis.crypto.randomUUID(),startCalls=calls.length;
  const result=await api(intel+'/suggest',{operation_id:op},['uncertain','invalid','invalid_review'].includes(mode)?502:200);
  if(!['uncertain','invalid','invalid_review'].includes(mode))assert.equal(result.suggested,0);
  if(mode==='allbad' || mode==='invalid')assert.equal(calls.filter(c=>c.url.endsWith('/embeddings')).length,calls.slice(0,startCalls).filter(c=>c.url.endsWith('/embeddings')).length);
  if(mode==='remote'){
   const remote=(await api(intel)).suggestions.find(s=>s.title==='Remote incoherent proposal');
   assert.equal(remote.novelty,1);assert.equal(remote.assessment_status,'ineligible');
   await api(intel+'/suggestions/'+remote.id+'/decision',{decision:'accepted'},409);
  }
  if(['uncertain','invalid','invalid_review'].includes(mode)){
   const after=calls.length;await api(intel+'/suggest',{operation_id:op},409);assert.equal(calls.length,after);
   const pending=(await api(intel)).suggestions.find(s=>s.title===(mode==='uncertain'?'A new topic with an uncertain review':mode==='invalid_review'?'Incomplete second review proposal':'Incomplete model assessment proposal'));
   assert.equal(pending.assessment_status,'uncertain');await api(intel+'/suggestions/'+pending.id+'/decision',{decision:'accepted'},409);
  }
 }
 suggestionMode='standard';
 await api(intel+'/topic-discovery/settings',{enabled:false});
 // #78: title-only is a private proposal, with no topic, SLOP seed or embedding until approval.
 const count=async table=>(await db.prepare('SELECT count(*) AS n FROM '+table).first()).n;
 const topicCount=await count('editorial_workspace_topics'),seedCount=await count('editorial_topic_slop_seed');
 const semanticCount=await count('editorial_topic_semantics'),descriptionCalls=()=>calls.filter(c=>c.body?.text?.format?.name==='topic_description').length;
 const embeddingCalls=()=>calls.filter(c=>c.url.endsWith('/embeddings')).length;
 // Historical suggestions with no description cannot bypass the new-topic confirmation flow.
 const oldSuggestion=globalThis.crypto.randomUUID(),oldSuggestionCalls=calls.length;
 await db.prepare("INSERT INTO editorial_topic_suggestions VALUES(?,?,?,?,'suggested',?,?)")
  .bind(oldSuggestion,'Historical title-only suggestion','historical title-only suggestion','Legacy rationale is not a semantic description.','fixture','fixture').run();
 await api(intel+'/suggestions/'+oldSuggestion+'/decision',{decision:'accepted'},409);
 assert.equal((await db.prepare('SELECT status FROM editorial_topic_suggestions WHERE id=?').bind(oldSuggestion).first()).status,'suggested');
 assert.equal(calls.length,oldSuggestionCalls);assert.equal(await count('editorial_workspace_topics'),topicCount);
 const descriptionTitle='Ambiguous owner topic',descriptionOp=globalThis.crypto.randomUUID();
 await api(ws+'/topics',{title:descriptionTitle},400);
 const draft=(await api(ws+'/topics',{title:descriptionTitle,operation_id:descriptionOp},202)).proposal;
 assert.ok(draft.ambiguity.includes('does not establish'));
 assert.equal(await count('editorial_workspace_topics'),topicCount);assert.equal(await count('editorial_topic_slop_seed'),seedCount);
 assert.equal(await count('editorial_topic_semantics'),semanticCount);
 const proposedCalls=descriptionCalls(),proposedEmbeddings=embeddingCalls();
 assert.equal((await api(ws+'/topics',{title:descriptionTitle,operation_id:descriptionOp},202)).proposal.id,draft.id);
 await api(ws+'/topics',{title:'  AMBIGUOUS  owner topic ',operation_id:globalThis.crypto.randomUUID()},409);
 await api(ws+'/topics',{title:'Different title using an old operation',operation_id:descriptionOp},409);
 assert.equal(descriptionCalls(),proposedCalls);
 const draftPath=ws+'/topic-descriptions/'+draft.id;
 const approval={title:draft.title,description:'The owner-confirmed final description, edited before indexing.',expected_sha256:draft.proposal_sha256};
 await api(draftPath+'/approve',{...approval,approved:true},400);
 await api(draftPath+'/approve',{...approval,expected_sha256:'0'.repeat(64)},409);
 await api(draftPath+'/approve',{...approval,title:'An altered proposal title'},409);
 await api(draftPath+'/approve',{...approval,description:''},400);
 assert.equal(embeddingCalls(),proposedEmbeddings);
 const approvals=await Promise.all([0,1].map(()=>api(draftPath+'/approve',approval,[200,201])));
 assert.equal(approvals[0].id,approvals[1].id);
 assert.equal(embeddingCalls(),proposedEmbeddings+1);
 const confirmed=(await api(ws)).topics.find(t=>t.id===approvals[0].id);
 assert.equal(confirmed.description,approval.description);
 const canonical='Topic: '+draft.title+'\nDescription: '+approval.description;
 assert.equal(calls.filter(c=>c.url.endsWith('/embeddings')).at(-1).body.input,canonical);
 assert.equal(confirmed.input_sha256,createHash('sha256').update(canonical).digest('hex'));
 await api(draftPath+'/approve',approval);assert.equal(embeddingCalls(),proposedEmbeddings+1);
 await api(draftPath+'/approve',{...approval,description:'A changed confirmation'},409);
 await api(ws+'/topics',{title:'AMBIGUOUS OWNER TOPIC',operation_id:globalThis.crypto.randomUUID()});
 assert.equal(descriptionCalls(),proposedCalls);
 // Regeneration invalidates the old version; cancellation never indexes either version.
 const regenTitle='Regenerated private proposal',regenOp=globalThis.crypto.randomUUID();
 const firstDraft=(await api(ws+'/topics',{title:regenTitle,operation_id:regenOp},202)).proposal;
 const regenPath=ws+'/topic-descriptions/'+firstDraft.id;
 const nextOp=globalThis.crypto.randomUUID();
 const regenBody={title:firstDraft.title,expected_sha256:firstDraft.proposal_sha256,operation_id:nextOp};
 const nextDraft=(await api(regenPath+'/regenerate',regenBody,202)).proposal;
 const afterRegenerate=descriptionCalls();
 assert.equal((await api(regenPath+'/regenerate',regenBody,202)).proposal.id,nextDraft.id);
 assert.equal(descriptionCalls(),afterRegenerate);
 await api(regenPath+'/regenerate',{...regenBody,expected_sha256:'0'.repeat(64)},409);
 // Recovery after a crash between the completed receipt and the draft update reads stored JSON only.
 await db.prepare("UPDATE editorial_topic_description_drafts SET status='preparing',description=NULL,proposal_sha256=NULL WHERE id=?").bind(nextDraft.id).run();
 assert.equal((await api(regenPath+'/regenerate',regenBody,202)).proposal.id,nextDraft.id);
 assert.equal(descriptionCalls(),afterRegenerate);
 await api(regenPath+'/approve',{title:firstDraft.title,description:firstDraft.description,expected_sha256:firstDraft.proposal_sha256},409);
 await api(ws+'/topic-descriptions/'+nextDraft.id+'/cancel',{title:nextDraft.title,expected_sha256:nextDraft.proposal_sha256});
 await api(ws+'/topic-descriptions/'+nextDraft.id+'/approve',{title:nextDraft.title,description:nextDraft.description,expected_sha256:nextDraft.proposal_sha256},409);
 assert.equal(embeddingCalls(),proposedEmbeddings+1);
 const concurrentTitle='Concurrent description proposal',concurrentCalls=descriptionCalls();
 await Promise.all([0,1].map(()=>api(ws+'/topics',{title:concurrentTitle,operation_id:globalThis.crypto.randomUUID()},[202,409])));
 assert.equal(descriptionCalls(),concurrentCalls+1);
 // Another editor can manually register the same title; the old proposal then conflicts without billing.
 const conflictTitle='Manual creation conflicts with a proposal';
 const conflictDraft=(await api(ws+'/topics',{title:conflictTitle,operation_id:globalThis.crypto.randomUUID()},202)).proposal;
 await api(ws+'/topics',{title:conflictTitle,description:'A deliberate manually written description.'},201);
 const afterConflict=embeddingCalls();
 await api(ws+'/topic-descriptions/'+conflictDraft.id+'/approve',{title:conflictTitle,description:conflictDraft.description,expected_sha256:conflictDraft.proposal_sha256},409);
 assert.equal(embeddingCalls(),afterConflict);
 // Insufficient budget and uncertain/invalid responses preserve input and never invent vectors.
 await db.prepare("INSERT INTO editorial_usage VALUES('fixture-budget-lock','fixture','2026-11-07','evaluation',10,'fixture')").run();
 await api(ws+'/topics',{title:'Budget unavailable description',operation_id:globalThis.crypto.randomUUID()},409);
 assert.equal(descriptionCalls(),concurrentCalls+2);await db.prepare("DELETE FROM editorial_usage WHERE id='fixture-budget-lock'").run();
 for(const mode of ['uncertain','invalid']){
  descriptionMode=mode;
  const title='Description provider '+mode,operation_id=globalThis.crypto.randomUUID(),startCalls=descriptionCalls();
  await api(ws+'/topics',{title,operation_id},502);
  await api(ws+'/topics',{title,operation_id},409);
  await api(ws+'/topics',{title,operation_id:globalThis.crypto.randomUUID()},409);
  assert.equal(descriptionCalls(),startCalls+1);
  assert.equal((await db.prepare("SELECT status FROM editorial_topic_description_jobs WHERE operation_key=?").bind('topic-description:'+operation_id).first()).status,'uncertain');
  const manuallySaved=await api(ws+'/topics',{title,description:'Manually supplied after the provider failure.'},201);
  assert.equal(manuallySaved.embedding_status,'ready');
 }
 descriptionMode='success';
 assert.equal((await api(intel)).topic_discovery_enabled,false);
 const upload=await fetch(new URL('/api/admin/'+ws+'/uploads?'+new URLSearchParams({topic_id:original.id,title:'OWNER_REAL_SECRET'}),base),{
  method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'image/webp'},body:photo('owner')});
 assert.equal(upload.status,201);const saved=await upload.json();
 const privatePhoto=await fetch(new URL('/api/admin/review-inbox/'+saved.inbox_id+'/image',base));assert.equal(privatePhoto.status,401);
 assert.equal((await api(intel+'?topic_id='+original.id)).ranked_real[0].id,saved.inbox_id);
 await api(intel+'/profile',{inbox_id:saved.inbox_id,sha256:saved.sha256});
 await api(intel+'/relevance',{inbox_id:saved.inbox_id,sha256:saved.sha256});
 assert.equal((await api(intel+'?topic_id='+original.id)).ranked_real[0].relevance.match,'mismatch');
 const queue=await api('review-inbox?state=pending&origin=REAL');
 const card=queue.images.find(i=>i.id===saved.inbox_id);
 await api('review-inbox/'+saved.inbox_id+'/decision',{decision:'approved',revision:card.revision,sha256:saved.sha256,reason:'editorial',note:''});
 assert.equal((await api(intel)).preferences.real.observations,1);
 // Persisted states reproduce their inputs and never duplicate on concurrent reads.
 const approvedState=(await api(intel)).preferences.real;
 assert.equal((await api(intel)).ranked_real_snapshot_id,approvedState.snapshot_id);
 const snapshotCount=(await db.prepare('SELECT count(*) AS n FROM editorial_preference_snapshots').first()).n;
 const repeated=await Promise.all([0,1,2].map(()=>api(intel)));
 assert.ok(repeated.every(p=>p.preferences.real.snapshot_id===approvedState.snapshot_id));
 assert.equal((await db.prepare('SELECT count(*) AS n FROM editorial_preference_snapshots').first()).n,snapshotCount);
 const archived=await api(intel+'/preferences/snapshots/'+approvedState.snapshot_id);
 assert.equal(createHash('sha256').update(JSON.stringify({origin:archived.origin,state:archived.state,sources:archived.sources})).digest('hex'),approvedState.snapshot_id);
 assert.equal(archived.origin,'REAL');assert.equal(archived.sources[0].inbox_id,saved.inbox_id);
 assert.equal(archived.sources[0].sha256,saved.sha256);assert.equal(archived.sources[0].used,true);
 assert.ok(archived.state.counts.every(c=>c.approved===1 && c.rejected===0));
 const snapshotVote=async(decision,reason)=>{
  const current=(await api('review-inbox?state=all&origin=REAL')).images.find(i=>i.id===saved.inbox_id);
  await api('review-inbox/'+saved.inbox_id+'/decision',{decision,revision:current.revision,sha256:current.sha256,reason,note:''});
  return (await api(intel)).preferences.real;
 };
 const rights=await snapshotVote('rejected','rights');assert.equal(rights.observations,0);assert.notEqual(rights.snapshot_id,approvedState.snapshot_id);
 const negative=await snapshotVote('rejected','editorial');assert.equal(negative.rejected,1);
 const restored=await snapshotVote('approved','editorial');assert.equal(restored.approved,1);assert.notEqual(restored.snapshot_id,approvedState.snapshot_id);
 assert.equal((await api(intel+'/preferences/snapshots/'+approvedState.snapshot_id)).approved,1);
 assert.ok((await api(intel+'/preferences/snapshots?origin=REAL')).snapshots.every(s=>s.origin==='REAL'));
 await assert.rejects(()=>db.prepare("UPDATE editorial_preference_snapshots SET approved=9 WHERE id=?").bind(approvedState.snapshot_id).run(),/immutable/);
 await assert.rejects(()=>db.prepare("DELETE FROM editorial_preference_snapshot_chunks WHERE snapshot_id=?").bind(approvedState.snapshot_id).run(),/immutable/);
 await api(intel+'/slop/plan',{topic_id:original.id});
 const generationCalls=calls.filter(c=>c.url.endsWith('/images/generations')).length;
 const concurrent=await Promise.all([0,1].map(slot=>api(intel+'/slop/generate',{topic_id:original.id,slot},[201,409])));
 const generated=concurrent.find(result=>result.pending);
 assert.ok(generated);assert.equal(concurrent.filter(result=>result.pending).length,1);
 assert.equal(calls.filter(c=>c.url.endsWith('/images/generations')).length,generationCalls+1);
 assert.ok(['1536x1024','1024x1536','1024x1024'].includes(generated.size));
 await api(intel+'/slop/generate',{topic_id:original.id,slot:0},409);
 await api(intel+'/search',{topic_id:original.id,limit:1,operation_id:globalThis.crypto.randomUUID()},409);
 await api(ws+'/manual-stage',{topic_id:original.id,decision:'finished'});
 const searchOp=globalThis.crypto.randomUUID();searchMode='partial';
 const search=await api(intel+'/search',{topic_id:original.id,limit:2,operation_id:searchOp});
 assert.equal(search.found,1);assert.equal(search.diagnostics.partial,true);
 const searches=calls.length;
 await api(intel+'/search',{topic_id:original.id,limit:2,operation_id:searchOp});assert.equal(calls.length,searches);
 for(const mode of ['empty','failed']){
  searchMode=mode;
  const result=await api(intel+'/search',{topic_id:original.id,limit:1,operation_id:globalThis.crypto.randomUUID()});
  assert.equal(result.found,0);assert.equal(result.status,mode==='failed'?'failed':'completed');
 }
 // Agreement: semantic descriptions never silently become REAL query or SLOP prompt constraints.
 const isolated=await api(ws+'/topics',{title:'Independent planning context for ordinary market work',description:'SEMANTIC_DESCRIPTION_SENTINEL: a detailed composition that must stay out of search and SLOP.'},201);
 const frozenBefore=await db.prepare('SELECT seed_json,sha256 FROM editorial_topic_slop_seed WHERE topic_id=?').bind(isolated.id).first();
 assert.ok(!frozenBefore.seed_json.includes('SEMANTIC_DESCRIPTION_SENTINEL'));
 const isolatedTopic=(await api(ws)).topics.find(t=>t.id===isolated.id);
 await api(ws+'/topics/'+isolated.id+'/semantics',{description:'SEMANTIC_DESCRIPTION_SENTINEL: an edited composition must not replace the frozen SLOP context.',expected_sha256:isolatedTopic.input_sha256});
 const frozenAfter=await db.prepare('SELECT seed_json,sha256 FROM editorial_topic_slop_seed WHERE topic_id=?').bind(isolated.id).first();
 assert.deepEqual(frozenAfter,frozenBefore);
 await api(ws+'/manual-stage',{topic_id:isolated.id,decision:'skip'});searchMode='empty';
 await api(intel+'/search',{topic_id:isolated.id,limit:1,operation_id:globalThis.crypto.randomUUID()});
 await api(intel+'/slop/plan',{topic_id:isolated.id});
 // Legacy geometry is audited explicitly against private bytes, without metadata/vote rewrites.
 const bucket=await mf.getR2Bucket('QUARANTINE');
 for(const name of ['geometry-probe','legacy-desktop','legacy-mobile','geometry-invalid']){
  const bytes=photo(name),sha=createHash('sha256').update(bytes).digest('hex'),key='geometry/'+name;
  await bucket.put(key,bytes,{httpMetadata:{contentType:'image/jpeg'}});
  const metadata=JSON.stringify({title:name,topic_id:isolated.id,image_geometry:{mime:'image/jpeg',width:240,height:120}});
  await db.prepare("INSERT INTO editorial_review_inbox(id,origin,sha256,media_key,metadata_json,created_at) VALUES(?,'REAL',?,?,?,?)").bind(name,sha,key,metadata,new Date().toISOString()).run();
  if(name.startsWith('legacy-'))continue; // The browser audits these fixtures independently.
  const beforeAudit=await db.prepare('SELECT * FROM editorial_review_inbox WHERE id=?').bind(name).first();
  const result=await api(intel+'/formats/analyze',{inbox_id:name,sha256:sha});
  assert.equal(result.geometry.orientation_status,name==='geometry-invalid'?'unknown':'explicit');
  if(name==='geometry-probe'){assert.equal(result.geometry.width,120);assert.equal(result.geometry.height,240);}
  assert.equal((await api(intel+'/formats/analyze',{inbox_id:name,sha256:sha})).already_audited,true);
  assert.deepEqual(await db.prepare('SELECT * FROM editorial_review_inbox WHERE id=?').bind(name).first(),beforeAudit);
  assert.deepEqual(Buffer.from(await (await bucket.get(key)).arrayBuffer()),bytes);
  await api(intel+'/formats/analyze',{inbox_id:name,sha256:'0'.repeat(64)},409);
  await assert.rejects(()=>db.prepare('DELETE FROM editorial_image_geometry WHERE inbox_id=?').bind(name).run(),/immutable/);
 }
 assert.ok((await api(intel)).format_unknown.some(f=>f.id==='geometry-invalid'));
 // Explicit budget reset is atomic/idempotent and never erases charged/uncertain work.
 const ledgerBefore=(await db.prepare('SELECT * FROM editorial_usage ORDER BY id').all()).results;
 const uncertainBefore=(await db.prepare("SELECT * FROM editorial_workspace_jobs WHERE status='uncertain' ORDER BY id").all()).results;
 const resetCalls=calls.length,resetBody={operation_id:globalThis.crypto.randomUUID(),expected_period_id:null,amount_usd:5};
 const resets=await Promise.all([0,1].map(()=>api(intel+'/budget/reset',resetBody)));
 assert.equal(resets[0].period_id,resets[1].period_id);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM editorial_budget_periods').first()).n,1);
 assert.equal(resets[0].budget.remaining_usd,5);assert.equal(resets[0].budget.used_usd,0);
 await api(intel+'/budget/reset',{...resetBody,operation_id:globalThis.crypto.randomUUID()},409);
 await api(intel+'/budget/reset',{...resetBody,amount_usd:50},400);
 assert.deepEqual((await db.prepare('SELECT * FROM editorial_usage ORDER BY id').all()).results,ledgerBefore);
 assert.deepEqual((await db.prepare("SELECT * FROM editorial_workspace_jobs WHERE status='uncertain' ORDER BY id").all()).results,uncertainBefore);
 assert.equal(calls.length,resetCalls);
 const firstPeriod=resets[0].period_id;
 // Active calls must finish before the owner can start a fresh budget period.
 const completedJob=await db.prepare("SELECT id FROM editorial_workspace_jobs WHERE status='completed' LIMIT 1").first();
 await db.prepare("UPDATE editorial_workspace_jobs SET status='submitting' WHERE id=?").bind(completedJob.id).run();
 await api(intel+'/budget/reset',{...resetBody,operation_id:globalThis.crypto.randomUUID(),expected_period_id:firstPeriod},409);
 await db.prepare("UPDATE editorial_workspace_jobs SET status='completed' WHERE id=?").bind(completedJob.id).run();
 await db.prepare("INSERT INTO editorial_usage VALUES('fill-period','fixture','2026-11-08','generation',4.99,'fixture')").run();
 const reserveBody={run_id:'budget-probe',stage:'visual',model:'gpt-6.1-terra',fingerprint:'1'.repeat(64)};
 const reservations=await Promise.all([1,2].map(n=>api('editorial/real-discovery/reserve',{...reserveBody,fingerprint:String(n).repeat(64)},[201,409])));
 assert.equal(reservations.filter(r=>r.reserved_usd===.01).length,1);
 assert.equal((await api(intel)).budget.used_usd,5);
 const success=reservations[0].reserved_usd===.01?1:2;
 assert.equal((await api('editorial/real-discovery/reserve',{...reserveBody,fingerprint:String(success).repeat(64)})).already_reserved,true);
 const callsAtLimit=calls.length;
 const limitedTopic=await api(ws+'/topics',{title:'Budget exhausted embedding',description:'A new manually described topic retained when the shared budget is exhausted.'},201);
 assert.equal(limitedTopic.embedding_status,'pending');assert.equal(calls.length,callsAtLimit);
 const nextReset=await api(intel+'/budget/reset',{...resetBody,operation_id:globalThis.crypto.randomUUID(),expected_period_id:firstPeriod});
 assert.equal(nextReset.budget.remaining_usd,5);
 assert.equal((await api(intel+'/budget/reset',resetBody)).period_id,firstPeriod);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM editorial_budget_periods').first()).n,2);
 const budgetIndexed=await api(ws+'/topics',{title:'Embedding after budget reset',description:'A new manually described photographic topic indexed within the fresh allowance.'},201);
 assert.equal(budgetIndexed.embedding_status,'ready');
 for(const sql of ['DELETE FROM editorial_budget_periods','UPDATE editorial_budget_periods SET allowance_usd=50','DELETE FROM editorial_budget_allocations'])await assert.rejects(()=>db.prepare(sql).run(),/immutable/);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM published_images').first()).n,0);
 await mkdir('artifacts',{recursive:true});await writeFile('artifacts/editorial-enabled-receipts.json',JSON.stringify(calls,null,2));
 if(process.env.ROS_TEST_BROWSER==='1'){
  const code=await new Promise((resolve,reject)=>{const browser=spawn('python3',['tests/editorial_browser.integration.py'],{env:{...process.env,ROS_TEST_BASE:base,ROS_TEST_TOKEN:token},stdio:'inherit'});browser.on('error',reject);browser.on('exit',resolve);});
  assert.equal(code,0);
 }
 console.log('Enabled editorial integration passed: real D1/R2, fake APIs, semantics, revisions, relevance, SLOP isolation, partial/empty/failed retrieval.');
}finally{await mf.dispose();}
