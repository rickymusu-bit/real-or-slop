import {admin, HttpError, json, sameOrigin, type Env} from './core';
export default {
 async fetch(request:Request, env:Env):Promise<Response> {
  try {
   const url=new URL(request.url); if(request.method!=='GET') sameOrigin(request);
   if(url.pathname==='/api/health') return json({name:'Real or Slop',demo:env.DATA_MODE==='demo'});
   if(url.pathname==='/api/categories') return json((await env.DB.prepare('SELECT * FROM categories ORDER BY rowid').all()).results);
   if(url.pathname.startsWith('/api/admin') || url.pathname.startsWith('/admin')) { await admin(request,env); if(url.pathname==='/api/admin') return json({configured:true}); }
   if(url.pathname.startsWith('/api/')) throw new HttpError(404,'API inesistente');
   return env.ASSETS.fetch(request);
  } catch(error) { return json({error:error instanceof HttpError?error.message:'Errore del server'},error instanceof HttpError?error.status:500); }
 }
};
