import worker from './worker.mjs';
import { runNews } from './news.mjs';

export default {
  async fetch(request, env) {
    // Point de vérification temporaire : désactivé sans secret, jamais accessible sans clé.
    if(new URL(request.url).pathname==='/internal/news/run') {
      if(request.method!=='POST'||!env.NEWS_RUN_KEY||request.headers.get('Authorization')!==`Bearer ${env.NEWS_RUN_KEY}`)return new Response('Not found',{status:404});
      try{return Response.json(await runNews(env,true));}catch(error){return Response.json({error:String(error.message)},{status:503});}
    }
    return worker.fetch(request,env);
  },
  async scheduled(event,env,ctx) {
    const results=await Promise.allSettled([worker.scheduled(event,env,ctx),runNews(env)]);
    if(results.some(r=>r.status==='rejected'))throw Error('scheduled_job_failed');
  },
};
