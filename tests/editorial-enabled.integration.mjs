/** Real Worker/D1/R2 with a fail-closed fake outbound service. Never reads real API keys. */
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {URL,URLSearchParams} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawnSync,spawn} from 'node:child_process';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

const token='fixture-admin-token-never-used-remotely-000064';
const calls=[];
let searchMode='success',embeddingMode='success',imageSequence=0;
const images=JSON.parse(spawnSync('python3',['-c',`import io,json,base64
from PIL import Image
out={}
for name,size,color in [('owner',(240,360),'blue'),('commons',(480,320),'red'),('1536x1024',(1536,1024),'green'),('1024x1536',(1024,1536),'yellow'),('1024x1024',(1024,1024),'purple')]:
 b=io.BytesIO();Image.new('RGB',size,color).save(b,'WEBP');out[name]=base64.b64encode(b.getvalue()).decode()
print(json.dumps(out))`],{encoding:'utf8'}).stdout);
const photo=name=>Buffer.from(images[name],'base64');
const reply=value=>globalThis.Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]});
const topics=[
 {title:'Paris agricultural protests in 2026',description:'Farmers demonstrating in Paris during 2026.',rationale:'A distinct later episode.'},
 {title:'Farm demonstrations Paris 2024',description:'Agricultural workers protesting in Paris in 2024.',rationale:'A paraphrase of the historical topic.'},
 {title:'Night work in coastal fish markets',description:'Fish vendors preparing coastal markets before sunrise.',rationale:'A photographically feasible new perspective.'}
];
const result=await build({entryPoints:['worker/index.ts'],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
const mf=new Miniflare(convertV4MiniflareOptions({host:'127.0.0.1',port:0,inspectorPort:0,workers:[{name:'editorial-fixture',modules:true,script:result.outputFiles[0].text,compatibilityDate:'2026-10-25',
 d1Databases:{DB:'editorial-enabled-fixture'},r2Buckets:['QUARANTINE','IMAGES'],
 assets:{directory:'dist',binding:'ASSETS',routerConfig:{has_user_worker:true},run_worker_first:['/api/*','/admin','/admin/*'],assetConfig:{not_found_handling:'single-page-application'}},
 bindings:{ADMIN_TOKEN:token,DATA_MODE:'demo',OPENAI_API_KEY:'fixture-not-a-real-key',WORKSPACE_AI_ENABLED:'true',
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
    return globalThis.Response.json({model:'text-embedding-3-small',data:[{index:0,embedding:[1,...Array(1535).fill(0)]}],usage:{total_tokens:24}});
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
   if(name==='topic_suggestions')return reply({suggestions:topics});
   if(name==='topic_duplicate_checks'){
    const comparisons=JSON.parse(data.input[1].content[0].text);
    assert.ok(comparisons.every(c=>c.neighbors.some(n=>n.title==='Paris agricultural protests in 2024')));
    return reply({decisions:comparisons.map(c=>({id:c.id,duplicate:c.title==='Farm demonstrations Paris 2024',reason:c.title.includes('2026')?'Distinct year and episode':'Same topic paraphrased or new subject'}))});
   }
   if(name==='commons_queries')return reply({queries:['fixture successful query','fixture second query']});
   if(name==='visual_profile'){
    assert.ok(!JSON.stringify(data.input).includes('OWNER_REAL_SECRET'),'Pixel-only model received title/metadata');
    return reply({subject:'Blue facade',action:'No visible action',setting:'Exterior',composition:'Portrait framing',visibility:'Clearly visible facade',interest:'Geometric patterns',tags:['blue_facade','geometry','architecture']});
   }
   if(name==='topic_relevance')return reply({match:'mismatch',reason:'A facade is visible, with no protesting people.'});
   if(name==='slop_prompts'){
    assert.ok(!JSON.stringify(data.input).includes('OWNER_REAL_SECRET'));
    assert.ok(!JSON.stringify(data.input).includes('blue_facade'));
    return reply({prompts:Array.from({length:8},(_,i)=>`Original synthetic editorial photograph variant ${i}, a natural candid scene with ambient daylight and a visible setting.`)});
   }
   throw Error('Unexpected model task: '+name);
  }
  if(url.hostname==='commons.wikimedia.org'){
   if(url.searchParams.get('list')==='search'){
    if(searchMode==='failed' || searchMode==='partial' && url.searchParams.get('srsearch').includes('second'))return new globalThis.Response('fixture failure',{status:503});
    return globalThis.Response.json({query:{search:searchMode==='empty'?[]:[{title:'File:Fixture.jpg'}]}});
   }
   return globalThis.Response.json({query:{pages:[{title:'File:Fixture.jpg',imageinfo:[{url:'https://upload.wikimedia.org/wikipedia/commons/a/ab/Fixture.webp',width:480,height:320,size:photo('commons').length,
    extmetadata:{Artist:{value:'Fixture author'},LicenseUrl:{value:'https://creativecommons.org/licenses/by/4.0/'}}}]}]}});
  }
  if(url.hostname==='upload.wikimedia.org')return new globalThis.Response(photo('commons'),{headers:{'Content-Type':'image/webp'}});
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
 const original=await api(ws+'/topics',{title:'Paris agricultural protests in 2024',description:'Agricultural workers demonstrating in Paris during 2024.'},201);
 assert.equal(original.embedding_status,'ready');assert.equal(calls.length,1);
 await api(ws+'/topics',{title:'Paris agricultural protests in 2024'},200);assert.equal(calls.length,1);
 const legacyId=globalThis.crypto.randomUUID();
 await db.prepare("INSERT INTO editorial_workspace_topics VALUES(?,?,?,?)").bind(legacyId,'An old unindexed owner topic','an old unindexed owner topic','2024').run();
 const pendingCalls=calls.length;
 const indexed=await Promise.all([0,1].map(()=>api(ws+'/topics/'+legacyId+'/semantics',{description:'A historical owner topic.',expected_sha256:null},[200,409])));
 assert.ok(indexed.some(r=>r.embedding_status==='ready'));
 assert.equal(calls.length,pendingCalls+1,'Concurrent backfill must embed once');
 const prior=(await api(ws)).topics.find(t=>t.id===original.id);
 await api(ws+'/topics/'+original.id+'/semantics',{description:'Farmers protesting in Paris in 2024, during a specific episode.',expected_sha256:prior.input_sha256});
 assert.equal((await db.prepare('SELECT count(*) AS n FROM editorial_topic_semantic_history').first()).n,1);
 await api(ws+'/topics/'+original.id+'/semantics',{description:'A stale overwrite',expected_sha256:prior.input_sha256},409);
 const revised=(await api(ws)).topics.find(t=>t.id===original.id),beforeRestore=calls.length;
 await api(ws+'/topics/'+original.id+'/semantics',{description:'Agricultural workers demonstrating in Paris during 2024.',expected_sha256:revised.input_sha256});
 assert.equal(calls.length,beforeRestore,'Restoring an archived vector must not bill again');
 embeddingMode='uncertain';
 const uncertain=await api(ws+'/topics',{title:'Uncertain provider receipt topic'},201);
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
 await api(intel+'/suggestions/'+suggestions.find(s=>s.title===topics[1].title).id+'/decision',{decision:'accepted'},409);
 const selected=suggestions.find(s=>s.title===topics[0].title);
 await api(intel+'/suggestions/'+selected.id+'/decision',{decision:'accepted'});
 const accepted=(await api(ws)).topics.find(t=>t.title===selected.title);
 assert.equal(accepted.description,topics[0].description);assert.equal(accepted.embedding_status,'ready');
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
 assert.equal((await db.prepare('SELECT count(*) AS n FROM published_images').first()).n,0);
 await mkdir('artifacts',{recursive:true});await writeFile('artifacts/editorial-enabled-receipts.json',JSON.stringify(calls,null,2));
 if(process.env.ROS_TEST_BROWSER==='1'){
  const code=await new Promise((resolve,reject)=>{const browser=spawn('python3',['tests/editorial_browser.integration.py'],{env:{...process.env,ROS_TEST_BASE:base,ROS_TEST_TOKEN:token},stdio:'inherit'});browser.on('error',reject);browser.on('exit',resolve);});
  assert.equal(code,0);
 }
 console.log('Enabled editorial integration passed: real D1/R2, fake APIs, semantics, revisions, relevance, SLOP isolation, partial/empty/failed retrieval.');
}finally{await mf.dispose();}
