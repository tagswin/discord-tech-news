import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {dueNews,parseNews,chooseNews,runNews} from '../src/news.mjs';
import config from '../src/news-config.mjs';

const date=new Date('2026-10-18T08:00:00Z');
const xml=`<rss><channel><item><title><![CDATA[Une annonce &amp; son contexte - Numerama]]></title><source url="https://www.numerama.com">Numerama</source><pubDate>Sun, 18 Oct 2026 07:30:00 GMT</pubDate><link>https://news.google.com/articles/123</link></item></channel></rss>`;

test('Paris été/hiver, rattrapage et absence de doublons',()=>{
  assert.equal(dueNews(date,[]),'2026-10-18T09');
  assert.equal(dueNews(date,['2026-10-18T09']),null);
  assert.equal(dueNews(new Date('2026-12-18T08:00Z'),[]),'2026-12-18T09');
  assert.equal(dueNews(new Date('2026-10-18T15:00Z'),[]),'2026-10-18T09');
  assert.equal(dueNews(new Date('2026-10-18T16:00Z'),[]),'2026-10-18T18');
  assert.equal(dueNews(new Date('2026-10-18T06:30Z'),[]),null);
});
test('XML RSS, médias acceptés et articles périmés',()=>{
  const a=parseNews(xml,config.categories[0].name,date);
  assert.equal(a[0].title,'Une annonce & son contexte');
  assert.equal(parseNews(xml.replace('www.numerama.com','evilnumerama.com'),'IA',date).length,0);
  assert.equal(parseNews(xml,'IA',new Date('2026-10-20T00:00Z')).length,0);
  assert.equal(chooseNews(a, a).length,0);
  const bing=xml.replace('<source url="https://www.numerama.com">Numerama</source>','<News:Source>Numerama</News:Source>').replace('https://news.google.com/articles/123','http://www.bing.com/news/apiclick.aspx?url=https%3A%2F%2Fwww.numerama.com%2Farticle');
  assert.equal(parseNews(bing,'IA',date)[0].url,'https://www.numerama.com/article');
});
test('publication confirmée puis anti-doublon ; aucune modification en cas de refus Discord',async t=>{
  const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../migrations/0003_news_scheduler.sql',import.meta.url),'utf8'));
  db.prepare('INSERT INTO news_state(id,state_json)VALUES(1,?)').run(JSON.stringify({started_at:date.toISOString(),sent:[],digests:[],alerts:[]}));
  const env={NEWS_ENABLED:'true',DISCORD_BOT_TOKEN:'test',DISCORD_NEWS_CHANNEL_ID:'1560649110628073523',DB:{prepare(sql){return {values:[],bind(...v){this.values=v;return this;},async first(){return db.prepare(sql).get(...this.values)||null;},async run(){return db.prepare(sql).run(...this.values);}};}}};
  const old=globalThis.fetch;let sends=0,deny=true;
  globalThis.fetch=async(url,options)=>{if(options?.method!=='POST')return new Response(xml);sends++;return deny?new Response('',{status:403}):Response.json({id:'555555555555555555'});};
  t.after(()=>{globalThis.fetch=old;db.close();});
  await assert.rejects(runNews(env,true,date),/403/);
  assert.equal(JSON.parse(db.prepare('SELECT state_json FROM news_state').get().state_json).digests.length,0);
  deny=false;const result=await runNews(env,true,date);
  assert.equal(result.messageId,'555555555555555555');
  const repeats=await runNews(env,false,date);
  assert.equal(repeats.status,'not_due');
  assert.equal(sends,2);
  assert.equal(db.prepare('SELECT lock_until FROM news_state').get().lock_until,0);
});
