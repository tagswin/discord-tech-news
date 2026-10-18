import config from './news-config.mjs';

const API = 'https://discord.com/api/v10';
const decode = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&#(x[0-9a-f]+|[0-9]+);|&(amp|lt|gt|quot|apos|nbsp);/gi, (_, n, named) => n ? String.fromCodePoint(Math.min(0x10ffff, n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n))) : ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[named.toLowerCase()]));
const clean = s => decode(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (s, name) => s.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] || '';

export function parseNews(xml, category, date = new Date()) {
  const out = [], cutoff = +date - 86400000;
  for (const match of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    const item = match[1], source = item.match(/<source\b([^>]*)>([\s\S]*?)<\/source>/i);
    let domain, publisher, url=decode(tag(item, 'link')).trim();
    try {
      if(source){domain=new URL(decode(source[1].match(/\burl=["']([^"']+)["']/i)?.[1])).hostname.replace(/^www\./,'');publisher=clean(source[2]);}
      else {const wrapped=new URL(url);if(wrapped.hostname.endsWith('.bing.com')&&wrapped.searchParams.has('url'))url=wrapped.searchParams.get('url');domain=new URL(url).hostname.replace(/^www\./,'');publisher=clean(tag(item,'News:Source'))||domain;}
    } catch { continue; }
    if (!config.allowed_domains.some(d => domain === d || domain.endsWith('.' + d))) continue;
    const published = Date.parse(tag(item, 'pubDate'));
    if (!Number.isFinite(published) || published < cutoff || published > +date + 300000) continue;
    let title = clean(tag(item, 'title'));
    if (publisher && title.endsWith(' - ' + publisher)) title = title.slice(0, -publisher.length - 3);
    if (new RegExp(config.excluded_pattern, 'i').test(title)) continue;
    if (!url.startsWith('https://') || !title) continue;
    out.push({title, publisher, domain, url, category, published: new Date(published).toISOString()});
    if (out.length >= 25) break;
  }
  return out.sort((a,b)=>Date.parse(b.published)-Date.parse(a.published));
}

export function dueNews(date, completed) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(date).map(x=>[x.type,x.value]));
  const hour = [...config.digest_hours].sort((a,b)=>b-a).find(h=>Number(p.hour)>=h);
  if (hour === undefined) return null;
  const slot = `${p.year}-${p.month}-${p.day}T${String(hour).padStart(2,'0')}`;
  return completed.includes(slot) ? null : slot;
}

const words = s => new Set(s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').match(/[a-z0-9]{3,}/g)?.filter(w=>!['avec','dans','pour','cette','sont','leur','leurs','une','des','les','est','sur','par','aux','plus','qui','que','son','ses','annonce','nouveau','nouvelle'].includes(w)) || []);
export function sameNews(a,b) {
  if (a.url === b.url) return true;
  const x=words(a.title), y=words(b.title), common=[...x].filter(v=>y.has(v)).length;
  return common >= 3 && common / (x.size+y.size-common) >= .45;
}

export function chooseNews(articles, sent) {
  const selected=[];
  for (const c of config.categories) {
    const a=articles.find(a=>a.category===c.name && ![...sent,...selected].some(b=>sameNews(a,b)));
    if(a)selected.push(a);
  }
  return selected;
}

async function fetchNews(c, date) {
  try {
    const url=c.rss || 'https://www.bing.com/news/search?'+new URLSearchParams({q:c.bing_query||c.query,format:'RSS',setlang:'fr-fr',cc:'FR',count:'30'});
    const response=await fetch(url,{headers:{'User-Agent':'ThinksRadarTech/2.0'},signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('rss');
    const reader=response.body.getReader();let bytes=0,xml='';const decoder=new TextDecoder();
    while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1000000){await reader.cancel();throw Error('size');}xml+=decoder.decode(value,{stream:true});}
    xml+=decoder.decode();
    if(!/<rss\b/i.test(xml))throw Error('rss');
    return {ok:true,articles:parseNews(xml,c.name,date)};
  } catch {return {ok:false,articles:[]};}
}

async function postNews(env, articles, heading) {
  const body={content:heading,allowed_mentions:{parse:[]},embeds:articles.map(a=>({title:a.title.slice(0,240),url:a.url,description:`**${a.category.slice(0,80)}** · ${a.publisher.slice(0,80)}`,timestamp:a.published,color:5793266}))};
  let endpoint=`${API}/channels/${env.DISCORD_NEWS_CHANNEL_ID}/messages`;
  const headers={'Content-Type':'application/json'};
  if(env.DISCORD_NEWS_WEBHOOK){
    const url=new URL(env.DISCORD_NEWS_WEBHOOK);
    if(url.protocol!=='https:'||url.hostname!=='discord.com'||!/^\/api\/webhooks\/\d+\/[\w-]+$/.test(url.pathname))throw Error('invalid_news_webhook');
    url.search='?wait=true';endpoint=url.href;body.username='Le Radar Tech';
  }else headers.Authorization=`Bot ${env.DISCORD_BOT_TOKEN}`;
  const response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('discord_news_http_'+response.status);
  const message=await response.json();
  if(!message.id)throw Error('discord_news_confirmation');
  return message.id;
}

export async function runNews(env, force=false, date=new Date()) {
  if(env.NEWS_ENABLED!=='true')return {status:'disabled'};
  const seconds=Math.floor(+date/1000);
  const lease=await env.DB.prepare('UPDATE news_state SET lock_until=? WHERE id=1 AND lock_until < ? RETURNING state_json, last_check').bind(seconds+180,seconds).first();
  if(!lease)return {status:'busy'};
  try {
    const state=JSON.parse(lease.state_json), slot=dueNews(date,state.digests);
    if(!force && !slot && seconds-lease.last_check<590)return {status:'not_due'};
    const results=await Promise.all([...config.categories,{rss:'https://www.numerama.com/feed/',name:''},{rss:'https://www.frandroid.com/feed',name:''}].map(c=>fetchNews(c,date)));
    if(!results.some(r=>r.ok))throw Error('all_news_feeds_failed');
    const patterns=[/\bIA\b|intelligence artificielle|openai|chatgpt|claude|gemini|gpt-/i,/fintech|finance|bourse|banque|boursier|chiffre d.affaires|résultats financiers/i,/cyber|faille|pirat|hameçonn|phishing|ransomware|sécurité informatique/i,/smartphone|iphone|galaxy|pixel|téléphone|montre connectée/i,/windows|linux|logiciel|processeur|carte graphique|nvidia|ordinateur|macbook|GPU/i,/jeu[x]? vidéo|gaming|playstation|xbox|nintendo|steam|console|GTA/i,/robot|spatial|fusée|spacex|NASA|satellite|astronaute/i];
    const articles=results.flatMap(r=>r.articles).flatMap(a=>a.category?[a]:config.categories.flatMap((c,i)=>patterns[i].test(a.title)?[{...a,category:c.name}]:[])).sort((a,b)=>Date.parse(b.published)-Date.parse(a.published));
    state.sent=state.sent.filter(s=>Date.parse(s.sent_at)>+date-7*86400000);
    state.alerts=state.alerts.filter(s=>Date.parse(s)>+date-86400000);
    state.digests=state.digests.slice(-16);
    let selected=[], alert=false;
    if(slot)selected=chooseNews(articles,state.sent);
    else if(state.alerts.length<config.max_alerts_per_day && (!state.alerts.length || +date-Date.parse(state.alerts.at(-1))>=7200000)) {
      const cutoff=Math.max(+date-10800000,Date.parse(state.started_at));
      const recent=articles.filter(a=>Date.parse(a.published)>=cutoff&&!state.sent.some(s=>sameNews(a,s)));
      for(const a of recent){if(!new RegExp(config.major_pattern,'i').test(a.title))continue;const b=recent.find(b=>a.domain!==b.domain&&sameNews(a,b));if(b){selected=[a,b];alert=true;break;}}
    }
    let messageId=null;
    if(selected.length){
      const stamp=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',dateStyle:'short',timeStyle:'short'}).format(date);
      messageId=await postNews(env,selected,alert?'🚨 **À la une tech**\nSignal détecté dans au moins deux médias ; consultez les sources.':`📰 **Le Radar Tech — ${stamp}**\nUne actualité par rubrique disponible.`);
      state.sent.push(...selected.map(a=>({...a,sent_at:date.toISOString()})));
      if(alert)state.alerts.push(date.toISOString());
    }
    if(slot)state.digests.push(slot);
    await env.DB.prepare('UPDATE news_state SET state_json=?, last_check=?, last_message_id=COALESCE(?,last_message_id) WHERE id=1').bind(JSON.stringify(state),seconds,messageId).run();
    console.log(JSON.stringify({event:'news_check',slot,articles:articles.length,sent:!!messageId}));
    return {status:'ok',slot,articleCount:articles.length,messageId};
  } finally {await env.DB.prepare('UPDATE news_state SET lock_until=0 WHERE id=1').run();}
}
