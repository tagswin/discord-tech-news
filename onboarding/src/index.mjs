import worker from './worker.mjs';
import { runNews } from './news.mjs';

export default {
  async fetch(request, env) {
    return worker.fetch(request,env);
  },
  async scheduled(event,env,ctx) {
    const results=await Promise.allSettled([worker.scheduled(event,env,ctx),runNews(env)]);
    if(results.some(r=>r.status==='rejected'))throw Error('scheduled_job_failed');
  },
};
