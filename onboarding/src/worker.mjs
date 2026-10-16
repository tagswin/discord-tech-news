export const QUESTIONS = [
  { id: 'age', title: 'Quel âge as-tu ?', options: ['Moins de 18 ans', '18–24 ans', '25–34 ans', '35 ans et +'] },
  { id: 'stage', title: 'Où en es-tu avec ton SaaS ?', options: ['Je cherche une idée', 'Je développe mon SaaS', 'Lancé, aucun client payant', 'Premiers clients (moins de 1k MRR)', '1k–5k MRR', 'Plus de 5k MRR'] },
  { id: 'goal', title: 'Quel est ton plus gros objectif actuellement ?', options: ['Trouver une idée rentable', 'Lancer mon SaaS', 'Obtenir mes premiers clients', 'Atteindre 1k MRR', 'Passer à 5k–10k MRR', 'Scaler au-delà'] },
  { id: 'blocker', title: "Qu’est-ce qui te bloque le plus ?", options: ['Trouver / valider une idée', 'Développement technique', 'Trouver des clients / acquisition', 'Marketing / création de contenu', 'Convertir mes visiteurs en clients', 'Rétention / churn', 'Manque de temps ou de méthode'] },
  { id: 'tried', title: 'Qu’as-tu déjà essayé pour résoudre ce problème ?', multiple: true, options: ["Rien pour l’instant", 'Contenus gratuits (YouTube, etc.)', 'Outils / logiciels / IA', 'Formation payante', 'Coaching / communauté payante', 'Freelance / agence'] },
  { id: 'budget', title: 'Combien dépenses-tu par mois pour développer ton SaaS ?', hint: 'Outils, marketing et autres dépenses liées à ton projet.', options: ['0 €', '1–50 €', '51–200 €', '201–499 €', '500 € et plus'] },
];

export const RULES = [
  'Respecter les membres : aucune insulte, discrimination ou forme de harcèlement.',
  'Ne pas publier de spam, publicité non autorisée, arnaque ou lien trompeur.',
  'Respecter le thème de chaque salon et les consignes de modération.',
  'Ne pas partager les données personnelles d’une autre personne sans son accord.',
  'Respecter les règles de Discord et les lois applicables.',
];
const RULES_VERSION = 'thinks-v1';
const API = 'https://discord.com/api/v10';
const now = () => Math.floor(Date.now() / 1000);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const random = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), x => x.toString(16).padStart(2, '0')).join('');
const hash = async (value) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), x => x.toString(16).padStart(2, '0')).join('');
const cookie = (name, value, age) => `__Host-${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;
const cookies = (request) => Object.fromEntries((request.headers.get('cookie') || '').split(';').map(v => v.trim().split('=')));

class Problem extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const CSS = `
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#0e1015;color:#eef0f7}*{box-sizing:border-box}body{margin:0}header,main,footer{width:min(760px,calc(100% - 40px));margin:auto}header{display:flex;align-items:center;justify-content:space-between;padding:32px 0;border-bottom:1px solid #272c38}.brand{font-size:20px;font-weight:800;letter-spacing:3px}.tag{font-size:12px;color:#a7b1c6;border:1px solid #303749;padding:7px 10px;border-radius:99px}main{padding:46px 0}h1{font-size:clamp(30px,6vw,44px);line-height:1.12;letter-spacing:-1.5px;margin:12px 0 18px}.eyebrow{color:#aa9dff;letter-spacing:2px;font-size:11px;font-weight:700;text-transform:uppercase}.intro,p{color:#adb7cc;line-height:1.7}.steps{display:flex;gap:8px;margin:28px 0;font-size:12px}.steps span{background:#1b202c;padding:8px 12px;border-radius:6px}.steps .active{color:#cdc4ff;background:#32284e}fieldset,.card{background:#161a24;border:1px solid #2a3040;border-radius:14px;padding:24px;margin:0 0 20px}legend{float:left;width:100%;font-size:18px;font-weight:650;line-height:1.45;margin-bottom:16px}fieldset:after{content:'';display:block;clear:both}.question-index{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9b8de0;display:block;margin-bottom:8px}.choices{clear:both;display:grid;gap:9px}label.choice{display:flex;align-items:center;gap:12px;padding:13px 14px;background:#1d2230;border:1px solid #30384b;border-radius:8px;cursor:pointer;font-size:14px;line-height:1.4}.choice:has(input:checked){background:#2d2547;border-color:#a28ae9}input{accent-color:#aa8fff;flex-shrink:0;width:18px;height:18px}input:focus-visible,textarea:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid #d2c0ff;outline-offset:3px}textarea{width:100%;resize:vertical;min-height:130px;background:#10141d;border:1px solid #394258;border-radius:8px;padding:14px;color:#fff;font:inherit;font-size:15px}.hint,.privacy{font-size:12px;color:#a0adc4}.hint{clear:both;margin-top:0}.button,button{display:inline-block;border:0;border-radius:9px;background:#b6a2ff;color:#181026;font:inherit;font-weight:750;padding:15px 23px;text-decoration:none;cursor:pointer}.button.secondary{background:#252c3c;color:#d8dcec}button.full{width:100%;margin-top:16px}.error{padding:18px;border:1px solid #b46979;background:#402632;color:#ffced8;border-radius:9px;margin-bottom:24px}ul.rules{padding-left:22px;color:#d5dbeb;line-height:1.8}li{margin-bottom:10px}a{color:#c8b7ff}.account{display:flex;justify-content:space-between;gap:12px;font-size:13px;color:#b3bed3;margin:28px 0}.fine{font-size:12px;color:#8995ac}footer{border-top:1px solid #272c38;padding:24px 0 36px;color:#8995ac;font-size:12px}.notice{border-left:3px solid #a18be1;padding-left:16px}form.logout{display:inline}form.logout button{padding:0;background:none;color:#c8b7ff;font-weight:400;font-size:13px}.success{font-size:44px;margin-bottom:16px}@media(max-width:480px){header,main,footer{width:calc(100% - 28px)}fieldset,.card{padding:18px}.tag{font-size:10px}.steps span{padding:7px 9px}main{padding-top:30px}}
`;

export function layout(title, body, status = 200, extra = {}) {
  return new Response(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Thinks</title><style>${CSS}</style></head><body><header><div class="brand">THINKS<span style="color:#b6a2ff">.</span></div><span class="tag">COMMUNAUTÉ SAAS</span></header><main>${body}</main><footer>Thinks · Un espace pour construire, lancer et faire grandir ton SaaS.</footer></body></html>`, {
    status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://discord.com; frame-ancestors 'none'; base-uri 'none'",
      'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', ...extra },
  });
}

const steps = (active) => `<div class="steps">${['1 · Règlement', '2 · Ton profil', '3 · Accès'].map((s, i) => `<span class="${i === active ? 'active' : ''}">${s}</span>`).join('')}</div>`;

export function landing(nonce, configured = true) {
  return layout('Bienvenue', `<div class="eyebrow">Bienvenue dans la communauté</div><h1>Ton prochain SaaS<br>commence ici.</h1><p class="intro">Avant de rejoindre les échanges, prends connaissance du règlement, puis présente-nous ton projet. Environ 2 minutes.</p>${steps(0)}<section class="card"><h2>Le règlement de Thinks</h2><ul class="rules">${RULES.map(r => `<li>${esc(r)}</li>`).join('')}</ul><form method="post" action="/auth/start"><input type="hidden" name="nonce" value="${esc(nonce)}"><label class="choice"><input type="checkbox" name="rules" value="accepted" required>J’ai lu et j’accepte le règlement de Thinks.</label><button class="full" ${configured ? '' : 'disabled'}>Accepter et continuer avec Discord →</button></form>${configured ? '' : '<p class="notice">Le formulaire est prêt. La connexion Discord est en cours de configuration.</p>'}</section><p class="privacy">Discord nous transmet ton identifiant et ton nom d’utilisateur pour relier tes réponses à ton compte. Aucun mot de passe ni adresse e-mail ne sont demandés.</p>`);
}

export function formPage(session, values = {}, error = '') {
  const fields = QUESTIONS.map((q, index) => `<fieldset><legend><span class="question-index">Question ${index + 1} · obligatoire</span>${esc(q.title)}</legend>${q.hint ? `<p class="hint">${esc(q.hint)}</p>` : ''}<div class="choices">${q.options.map((label, i) => `<label class="choice"><input type="${q.multiple ? 'checkbox' : 'radio'}" name="${q.id}" value="${i}" ${!q.multiple ? 'required' : ''} ${((values[q.id] || []).map(String).includes(String(i))) ? 'checked' : ''}>${esc(label)}</label>`).join('')}</div>${q.multiple ? '<p class="hint">Plusieurs réponses possibles. « Rien pour l’instant » doit être sélectionné seul.</p>' : ''}</fieldset>`).join('');
  return layout('Ton profil', `<div class="eyebrow">Faisons connaissance</div><h1>Parle-nous de ton projet.</h1><p>Ces réponses aident l’équipe à comprendre ton parcours et les besoins de la communauté. Elles ne sont pas affichées aux autres membres.</p>${steps(1)}<div class="account"><span>Connecté : <strong>${esc(session.display_name)}</strong></span><form class="logout" method="post" action="/logout"><input type="hidden" name="csrf" value="${esc(session.csrf)}"><button>Changer de compte</button></form></div>${error ? `<div class="error" role="alert">${esc(error)}</div>` : ''}<form method="post" action="/submit"><input type="hidden" name="csrf" value="${esc(session.csrf)}">${fields}<fieldset><legend><span class="question-index">Question 7 · facultative</span>Si tu pouvais débloquer UNE chose dans ton SaaS aujourd’hui, ce serait quoi ?</legend><textarea name="wish" maxlength="1000" aria-label="Ce que tu aimerais débloquer" placeholder="Ce qui ferait vraiment avancer ton projet…">${esc(values.wish?.[0] || '')}</textarea><p class="hint">1 000 caractères maximum. N’indique aucune donnée confidentielle.</p></fieldset><p class="privacy">Les six premières questions sont obligatoires pour accéder aux salons. Ton identifiant Discord, ton nom d’utilisateur et tes réponses sont conservés jusqu’à 90 jours dans l’espace privé de l’équipe, hébergé chez Cloudflare. Pour demander leur suppression, contacte un administrateur de Thinks dans Discord.</p><button class="full">Valider mon profil et accéder au serveur →</button></form>`);
}

export function validateAnswers(data) {
  const answer = {};
  for (const q of QUESTIONS) {
    const values = data.getAll(q.id);
    if (!values.length || (!q.multiple && values.length !== 1) || new Set(values).size !== values.length
      || values.some(v => typeof v !== 'string' || !/^\d+$/.test(v) || String(Number(v)) !== v || !q.options[Number(v)])) {
      throw new Problem(400, `Merci de répondre à la question « ${q.title} » avec les choix proposés.`);
    }
    if (q.multiple && values.includes('0') && values.length > 1) throw new Problem(400, 'Sélectionne « Rien pour l’instant » seul, ou choisis les solutions déjà essayées.');
    answer[q.id] = values.map(v => q.options[Number(v)]);
  }
  const wish = data.getAll('wish');
  if (wish.length > 1 || wish.some(v => typeof v !== 'string' || v.length > 1000)) throw new Problem(400, 'La réponse libre est limitée à 1 000 caractères.');
  answer.wish = (wish[0] || '').trim();
  return answer;
}

function origin(env) {
  const url = new URL(env.APP_ORIGIN);
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) throw new Error('APP_ORIGIN');
  return url.origin;
}

function configured(env) {
  return !!(env.DB && env.DISCORD_CLIENT_SECRET && env.DISCORD_BOT_TOKEN && env.APP_ORIGIN
    && [env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID, env.DISCORD_MEMBER_ROLE_ID].every(v => /^\d{15,22}$/.test(v || ''))
    && env.DISCORD_MEMBER_ROLE_ID !== env.DISCORD_GUILD_ID);
}

async function readBody(request, env) {
  if (request.headers.get('Origin') !== origin(env)) throw new Problem(403, 'Origine du formulaire non autorisée. Recharge la page.');
  if (!request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded')) throw new Problem(415, 'Format du formulaire non reconnu.');
  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  let bytes = 0, text = '';
  if (reader) while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 16384) { await reader.cancel(); throw new Problem(413, 'Formulaire trop volumineux.'); }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return new URLSearchParams(text);
}

async function discord(path, env, method = 'GET', bearer = null) {
  const response = await fetch(API + path, { method, headers: { Authorization: bearer ? `Bearer ${bearer}` : `Bot ${env.DISCORD_BOT_TOKEN}` }, signal: AbortSignal.timeout(12000) });
  if (response.status === 404) throw new Problem(403, 'Rejoins le serveur Thinks avec ce compte Discord, puis réessaie.');
  if (!response.ok) throw new Problem(503, 'Discord est momentanément indisponible ou le bot manque de permissions. Réessaie dans un instant ou contacte un administrateur.');
  return response.status === 204 ? null : response.json();
}

async function member(userId, env) {
  const result = await discord(`/guilds/${env.DISCORD_GUILD_ID}/members/${userId}`, env);
  if (result.pending === true) throw new Problem(403, 'Accepte d’abord le règlement dans Discord, puis reviens sur ce formulaire.');
  return result;
}

async function sessionFor(request, env) {
  const token = cookies(request)['__Host-session'];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new Problem(401, 'Aucune connexion Discord active. Reviens à l’accueil pour te connecter.');
  const session = await env.DB.prepare('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?').bind(await hash(token), now()).first();
  if (!session) throw new Problem(401, 'Ta session a expiré. Reviens à l’accueil pour te reconnecter.');
  return session;
}

function redirect(path, extraCookies = []) {
  const headers = new Headers({ Location: path, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  for (const value of extraCookies) headers.append('Set-Cookie', value);
  return new Response(null, { status: 303, headers });
}

async function route(request, env) {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/') {
    const nonce = random();
    const page = landing(nonce, configured(env));
    page.headers.append('Set-Cookie', cookie('preauth', nonce, 600));
    return page;
  }
  if (!configured(env)) throw new Problem(503, 'Le formulaire n’est pas encore connecté à Discord. L’équipe termine sa configuration.');
  if (url.origin !== origin(env)) throw new Problem(400, 'Adresse du formulaire non reconnue.');
  if (request.method === 'POST' && url.pathname === '/auth/start') {
    const data = await readBody(request, env);
    const nonce = cookies(request)['__Host-preauth'];
    if (!nonce || !/^[a-f0-9]{64}$/.test(nonce) || data.get('nonce') !== nonce || data.get('rules') !== 'accepted') throw new Problem(400, 'Lis et accepte le règlement avant de continuer.');
    const state = random();
    await env.DB.prepare('INSERT INTO oauth_states (state_hash, expires_at, rules_accepted_at, rules_version) VALUES (?, ?, ?, ?)').bind(await hash(state), now() + 600, now(), RULES_VERSION).run();
    const authorize = new URL('https://discord.com/oauth2/authorize');
    authorize.search = new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, redirect_uri: origin(env) + '/auth/callback', response_type: 'code', scope: 'identify', state }).toString();
    return redirect(authorize.href, [cookie('oauth', state, 600), cookie('preauth', '', 0)]);
  }
  if (request.method === 'GET' && url.pathname === '/auth/callback') {
    const state = url.searchParams.get('state');
    if (!state || !/^[a-f0-9]{64}$/.test(state) || state !== cookies(request)['__Host-oauth']) throw new Problem(400, 'Connexion Discord non valide. Recommence depuis l’accueil.');
    const receipt = await env.DB.prepare('DELETE FROM oauth_states WHERE state_hash = ? AND expires_at > ? RETURNING rules_accepted_at, rules_version').bind(await hash(state), now()).first();
    if (!receipt || !url.searchParams.get('code') || url.searchParams.has('error')) throw new Problem(400, 'Connexion expirée ou annulée. Recommence depuis l’accueil.');
    const response = await fetch('https://discord.com/api/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code: url.searchParams.get('code'), redirect_uri: origin(env) + '/auth/callback' }), signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Problem(401, 'La connexion Discord a échoué. Recommence depuis l’accueil.');
    const token = await response.json();
    if (typeof token.access_token !== 'string' || !token.access_token || token.token_type?.toLowerCase() !== 'bearer') throw new Problem(401, 'Discord n’a pas confirmé la connexion. Recommence depuis l’accueil.');
    const user = await discord('/users/@me', env, 'GET', token.access_token);
    if (!/^\d{15,22}$/.test(user.id)) throw new Problem(401, 'Identifiant Discord non reconnu.');
    const sessionToken = random();
    await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, display_name, csrf, expires_at, rules_accepted_at, rules_version) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(await hash(sessionToken), user.id, user.global_name || user.username, random(), now() + 3600, receipt.rules_accepted_at, receipt.rules_version).run();
    // Les jetons OAuth ne sont pas conservés ; le bot contrôle ensuite l’appartenance au serveur.
    return redirect('/form', [cookie('session', sessionToken, 3600), cookie('oauth', '', 0)]);
  }
  if (request.method === 'GET' && url.pathname === '/form') {
    const session = await sessionFor(request, env);
    await member(session.user_id, env);
    return formPage(session);
  }
  if (request.method === 'POST' && ['/submit', '/logout'].includes(url.pathname)) {
    const session = await sessionFor(request, env);
    const data = await readBody(request, env);
    if (data.get('csrf') !== session.csrf) throw new Problem(403, 'Formulaire expiré. Recharge la page avant de réessayer.');
    if (url.pathname === '/logout') {
      await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(session.token_hash).run();
      return redirect('/', [cookie('session', '', 0)]);
    }
    let answers;
    try { answers = validateAnswers(data); }
    catch (error) {
      if (!(error instanceof Problem)) throw error;
      return new Response(formPage(session, Object.fromEntries([...new Set(data.keys())].map(k => [k, data.getAll(k)])), error.message).body, { status: 400, headers: formPage(session).headers });
    }
    const currentMember = await member(session.user_id, env);
    // Enregistrer d’abord : aucun rôle si la persistance des réponses échoue.
    await env.DB.prepare('INSERT INTO applications (user_id, display_name, answers_json, rules_accepted_at, rules_version, submitted_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name, answers_json=excluded.answers_json, rules_accepted_at=excluded.rules_accepted_at, rules_version=excluded.rules_version, submitted_at=excluded.submitted_at').bind(session.user_id, session.display_name, JSON.stringify(answers), session.rules_accepted_at, session.rules_version, now()).run();
    if (!currentMember.roles?.includes(env.DISCORD_MEMBER_ROLE_ID)) {
      await discord(`/guilds/${env.DISCORD_GUILD_ID}/members/${session.user_id}/roles/${env.DISCORD_MEMBER_ROLE_ID}`, env, 'PUT');
    }
    await env.DB.prepare('UPDATE applications SET role_granted_at = ? WHERE user_id = ?').bind(now(), session.user_id).run();
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(session.token_hash).run();
    const page = layout('Bienvenue chez Thinks', `${steps(2)}<section class="card"><div class="success">✓</div><h1>Bienvenue chez Thinks.</h1><p>Ton profil est enregistré et le rôle Membre t’a été attribué. Tu peux maintenant accéder aux salons de la communauté.</p><a class="button" href="https://discord.com/channels/${esc(env.DISCORD_GUILD_ID)}">Ouvrir le serveur Discord →</a></section>`);
    page.headers.append('Set-Cookie', cookie('session', '', 0));
    return page;
  }
  throw new Problem(404, 'Cette page n’existe pas.');
}

export default {
  async fetch(request, env) {
    try { return await route(request, env); }
    catch (error) {
      const status = error instanceof Problem ? error.status : 503;
      const message = error instanceof Problem ? error.message : 'Le service est momentanément indisponible. Réessaie dans un instant ou contacte l’équipe Thinks.';
      // Ne jamais journaliser les URLs OAuth, jetons, cookies ou réponses des membres.
      const retry = status === 401
        ? '<p><a class="button" href="/">Se connecter avec Discord</a></p>'
        : '<p><a class="button secondary" href="/form">Réessayer le formulaire</a></p><p><a href="/">Revenir au règlement et à la connexion</a></p>';
      return layout('Une étape reste à terminer', `<h1>Une étape reste à terminer.</h1><p role="alert">${esc(message)}</p>${retry}`, status);
    }
  },
  async scheduled(_event, env) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM oauth_states WHERE expires_at < ?').bind(now()),
      env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now()),
      env.DB.prepare('DELETE FROM applications WHERE submitted_at < ?').bind(now() - 90 * 86400),
    ]);
  },
};
