import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker, { QUESTIONS, validateAnswers, formPage } from '../src/worker.mjs';

const ORIGIN = 'https://thinks.example';
const USER = '111111111111111111';
const GUILD = '1498690479288483932';
const ROLE = '222222222222222222';
const epoch = () => Math.floor(Date.now() / 1000);

function setup(t) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'));
  const DB = {
    prepare(sql) {
      return { values: [], bind(...values) { this.values = values; return this; },
        async first() { return sqlite.prepare(sql).get(...this.values) || null; },
        async run() { return { meta: sqlite.prepare(sql).run(...this.values) }; } };
    },
    async batch(queries) { return Promise.all(queries.map(q => q.run())); },
  };
  const env = { DB, APP_ORIGIN: ORIGIN, DISCORD_CLIENT_ID: '333333333333333333', DISCORD_CLIENT_SECRET: 'test-only-client-secret', DISCORD_BOT_TOKEN: 'test-only-bot-token', DISCORD_GUILD_ID: GUILD, DISCORD_MEMBER_ROLE_ID: ROLE };
  const api = { calls: [], pending: false, notMember: false, roleFailure: false };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    api.calls.push({ url: String(url), options });
    if (url === 'https://discord.com/api/oauth2/token') return Response.json({ access_token: 'test-only-oauth-token', token_type: 'Bearer' });
    if (url === 'https://discord.com/api/v10/users/@me') return Response.json({ id: USER, username: 'Testeur', global_name: '<script>bad()</script>' });
    if (url === `https://discord.com/api/v10/guilds/${GUILD}/members/${USER}`) return api.notMember ? Response.json({}, { status: 404 }) : Response.json({ pending: api.pending, roles: [] });
    if (url === `https://discord.com/api/v10/guilds/${GUILD}/members/${USER}/roles/${ROLE}` && options.method === 'PUT') return new Response(null, { status: api.roleFailure ? 403 : 204 });
    throw new Error('Appel réseau non simulé interdit : ' + url);
  };
  t.after(() => { globalThis.fetch = originalFetch; sqlite.close(); });
  return { sqlite, env, api, request: (path, options) => worker.fetch(new Request(ORIGIN + path, options), env) };
}

function post(data, cookie = '') {
  return { method: 'POST', headers: { Origin: ORIGIN, Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(data) };
}

function answers(csrf) {
  const data = new URLSearchParams({ csrf, wish: '' });
  for (const q of QUESTIONS) data.set(q.id, '0');
  return data;
}

async function start(s) {
  const page = await s.request('/');
  assert.match(page.headers.get('Content-Security-Policy'), /form-action 'self' https:\/\/discord\.com;/);
  // no-referrer masque Origin sur les soumissions HTML natives, contrairement à fetch().
  assert.equal(page.headers.get('Referrer-Policy'), 'strict-origin');
  const nonce = page.headers.get('set-cookie').match(/__Host-preauth=([a-f0-9]+)/)[1];
  const auth = await s.request('/auth/start', post({ rules: 'accepted', nonce }, '__Host-preauth=' + nonce));
  assert.equal(auth.status, 303);
  const authorization = new URL(auth.headers.get('location'));
  assert.equal(authorization.searchParams.get('scope'), 'identify');
  assert.equal(authorization.searchParams.get('redirect_uri'), ORIGIN + '/auth/callback');
  return authorization.searchParams.get('state');
}

async function login(s) {
  const state = await start(s);
  const response = await s.request('/auth/callback?code=testing&state=' + state, { headers: { Cookie: '__Host-oauth=' + state } });
  assert.equal(response.status, 303);
  const cookie = response.headers.getSetCookie().find(v => v.startsWith('__Host-session=')).split(';')[0];
  const session = s.sqlite.prepare('SELECT * FROM sessions').get();
  return { cookie, session };
}

test('règlement accepté puis profil puis rôle pour le compte authentifié uniquement', async t => {
  const s = setup(t);
  const { cookie, session } = await login(s);
  const form = await s.request('/form', { headers: { Cookie: cookie } });
  assert.equal(form.status, 200);
  assert.match(await form.text(), /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  const data = answers(session.csrf);
  data.set('user_id', '999999999999999999');
  data.set('role_id', '999999999999999999');
  data.set('wish', '<img src=x onerror=alert(1)>');
  const submit = await s.request('/submit', post(data, cookie));
  assert.equal(submit.status, 200);
  const row = s.sqlite.prepare('SELECT * FROM applications').get();
  assert.equal(row.user_id, USER);
  assert.ok(row.rules_accepted_at > 0);
  assert.ok(row.role_granted_at > 0);
  assert.equal(JSON.parse(row.answers_json).wish, '<img src=x onerror=alert(1)>');
  assert.equal(s.api.calls.filter(c => c.options.method === 'PUT').length, 1);
  assert.equal(s.sqlite.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
  assert.equal((await s.request('/submit', post(data, cookie))).status, 401);
});

test('OAuth demande seulement identify et refuse les callbacks non liés au navigateur', async t => {
  const s = setup(t);
  const state = await start(s);
  const response = await s.request('/auth/callback?state=' + state + '&code=testing');
  assert.equal(response.status, 400);
  assert.equal(s.api.calls.length, 0);
  const valid = await s.request('/auth/callback?state=' + state + '&code=testing', { headers: { Cookie: '__Host-oauth=' + state } });
  assert.equal(valid.status, 303);
  const calls = s.api.calls.length;
  assert.equal((await s.request('/auth/callback?state=' + state + '&code=testing', { headers: { Cookie: '__Host-oauth=' + state } })).status, 400);
  assert.equal(s.api.calls.length, calls);
});

test('acceptation du règlement et nonce obligatoires avant OAuth', async t => {
  const s = setup(t);
  assert.equal((await s.request('/auth/start', post({ rules: 'accepted', nonce: 'inventé' }))).status, 400);
  assert.equal(s.sqlite.prepare('SELECT COUNT(*) AS n FROM oauth_states').get().n, 0);
});

test('une session expirée ne peut pas envoyer de réponses', async t => {
  const s = setup(t);
  const { cookie, session } = await login(s);
  s.sqlite.prepare('UPDATE sessions SET expires_at = ?').run(epoch() - 10);
  assert.equal((await s.request('/submit', post(answers(session.csrf), cookie))).status, 401);
  assert.equal(s.api.calls.filter(c => c.options.method === 'PUT').length, 0);
});

test('sans connexion, la reprise dirige vers la connexion et pas vers le formulaire protégé', async t => {
  const s = setup(t);
  const response = await s.request('/form');
  assert.equal(response.status, 401);
  const html = await response.text();
  assert.match(html, /Aucune connexion Discord active/);
  assert.match(html, /href="\/">Se connecter avec Discord/);
  assert.ok(!html.includes('href="/form"'));
});

test('formulaire incomplet, choix inventés et réponses multiples interdites ne donnent aucun rôle', async t => {
  const s = setup(t);
  const { cookie, session } = await login(s);
  for (const mode of ['missing', 'invented', 'multiple']) {
    const data = answers(session.csrf);
    if (mode === 'missing') data.delete('goal');
    if (mode === 'invented') data.set('budget', '999');
    if (mode === 'multiple') data.append('age', '1');
    assert.equal((await s.request('/submit', post(data, cookie))).status, 400);
  }
  assert.equal(s.api.calls.filter(c => c.options.method === 'PUT').length, 0);
  assert.equal(s.sqlite.prepare('SELECT COUNT(*) AS n FROM applications').get().n, 0);
});

test('plusieurs solutions possibles, mais aucune combinaison avec Rien pour l’instant', () => {
  const data = answers('csrf');
  data.set('tried', '1'); data.append('tried', '2');
  assert.equal(validateAnswers(data).tried.length, 2);
  data.append('tried', '0');
  assert.throws(() => validateAnswers(data), /seul/);
  data.delete('tried'); data.set('tried', '1');
  data.set('wish', 'x'.repeat(1001));
  assert.throws(() => validateAnswers(data), /1 000/);
});

test('la vérification pending de Discord est contrôlée avant formulaire et avant attribution', async t => {
  const s = setup(t);
  const { cookie, session } = await login(s);
  s.api.pending = true;
  assert.equal((await s.request('/form', { headers: { Cookie: cookie } })).status, 403);
  assert.equal((await s.request('/submit', post(answers(session.csrf), cookie))).status, 403);
  assert.equal(s.api.calls.filter(c => c.options.method === 'PUT').length, 0);
  assert.equal(s.sqlite.prepare('SELECT COUNT(*) AS n FROM applications').get().n, 0);
});

test('un compte hors du serveur ne peut pas recevoir de rôle', async t => {
  const s = setup(t);
  const { cookie, session } = await login(s);
  s.api.notMember = true;
  assert.equal((await s.request('/submit', post(answers(session.csrf), cookie))).status, 403);
  assert.equal(s.api.calls.filter(c => c.options.method === 'PUT').length, 0);
});

test('Origin et CSRF empêchent un envoi déclenché par un autre site', async t => {
  const s = setup(t);
  const { cookie, session } = await login(s);
  const request = post(answers(session.csrf), cookie);
  request.headers.Origin = 'https://evil.example';
  assert.equal((await s.request('/submit', request)).status, 403);
  assert.equal((await s.request('/submit', post(answers('wrong'), cookie))).status, 403);
  assert.equal(s.api.calls.filter(c => c.options.method === 'PUT').length, 0);
});

test('échec d’enregistrement : aucun rôle attribué', async t => {
  const s = setup(t);
  const { cookie, session } = await login(s);
  s.sqlite.exec('DROP TABLE applications');
  assert.equal((await s.request('/submit', post(answers(session.csrf), cookie))).status, 503);
  assert.equal(s.api.calls.filter(c => c.options.method === 'PUT').length, 0);
});

test('échec Discord : réponses privées conservées et nouvelle tentative possible', async t => {
  const s = setup(t);
  const { cookie, session } = await login(s);
  s.api.roleFailure = true;
  assert.equal((await s.request('/submit', post(answers(session.csrf), cookie))).status, 503);
  assert.equal(s.sqlite.prepare('SELECT role_granted_at FROM applications').get().role_granted_at, null);
  s.api.roleFailure = false;
  assert.equal((await s.request('/submit', post(answers(session.csrf), cookie))).status, 200);
  assert.ok(s.sqlite.prepare('SELECT role_granted_at FROM applications').get().role_granted_at > 0);
});

test('nettoyage quotidien : réponses de plus de 90 jours supprimées', async t => {
  const s = setup(t);
  s.sqlite.prepare('INSERT INTO applications VALUES (?, ?, ?, ?, ?, ?, ?)').run(USER, 'Testeur', '{}', epoch(), 'v1', epoch() - 91 * 86400, epoch());
  s.sqlite.prepare('INSERT INTO applications VALUES (?, ?, ?, ?, ?, ?, ?)').run('444444444444444444', 'Récent', '{}', epoch(), 'v1', epoch() - 89 * 86400, epoch());
  await worker.scheduled({}, s.env);
  assert.equal(s.sqlite.prepare('SELECT COUNT(*) AS n FROM applications').get().n, 1);
});

test('rendu protégé contre le HTML des réponses et aucune ressource externe', async () => {
  const response = formPage({ display_name: '<script>x</script>', csrf: 'x' }, { wish: ['</textarea><script>x</script>'] });
  const text = await response.text();
  assert.ok(!text.includes('<script>'));
  assert.match(text, /&lt;\/textarea&gt;/);
  assert.match(response.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Referrer-Policy'), 'strict-origin');
});
