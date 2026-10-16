"""Veille tech gratuite : RSS, Discord et état versionné, sans API d'IA."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
from email.utils import parsedate_to_datetime
import html
import json
import os
from pathlib import Path
import re
import sys
import time
import unicodedata
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
UTC = timezone.utc
STOP = set('avec dans pour cette sont leur leurs une des les est sur par aux plus qui que son ses du de la le et en un au se ce ces sa annonce nouveau nouvelle'.split())


def clean(value):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', value or ''))).strip()


def tokens(title):
    title = unicodedata.normalize('NFKD', title.casefold())
    title = ''.join(c for c in title if not unicodedata.combining(c))
    return {w for w in re.findall(r'[a-z0-9]+', title) if len(w) > 2 and w not in STOP}


def same_story(a, b):
    x, y = tokens(a), tokens(b)
    return (len(x & y) >= 3 and len(x & y) / max(1, len(x | y)) >= .45) or SequenceMatcher(None, a.casefold(), b.casefold()).ratio() >= .87


def known(article, sent):
    return any(article['url'] == old['url'] or same_story(article['title'], old['title']) for old in sent)


def parse_feed(data, category, now, allowed_domains, excluded_pattern=None):
    result = []
    for item in ET.fromstring(data).findall('./channel/item'):
        source = item.find('source')
        if source is None:
            continue
        domain = (urlparse(source.get('url', '')).hostname or '').lower().removeprefix('www.')
        if not any(domain == d or domain.endswith('.' + d) for d in allowed_domains):
            continue
        try:
            published = parsedate_to_datetime(item.findtext('pubDate', ''))
            if published.tzinfo is None:
                published = published.replace(tzinfo=UTC)
        except (ValueError, TypeError, OverflowError):
            continue
        if not now - timedelta(hours=24) <= published <= now + timedelta(minutes=5):
            continue
        title = clean(item.findtext('title'))
        publisher = clean(source.text)
        if publisher and title.endswith(' - ' + publisher):
            title = title[:-(len(publisher) + 3)]
        if excluded_pattern and re.search(excluded_pattern, title, re.IGNORECASE):
            continue
        link = item.findtext('link', '').strip()
        if not title or urlparse(link).scheme != 'https':
            continue
        result.append(dict(title=title, url=link, publisher=publisher, domain=domain,
                           published=published.isoformat(), category=category))
    return sorted(result, key=lambda a: a['published'], reverse=True)


def fetch_category(category, config, now):
    query = category['query'] + ' when:1d'
    url = 'https://news.google.com/rss/search?' + urlencode(dict(q=query, hl='fr', gl='FR', ceid='FR:fr'))
    try:
        request = Request(url, headers={'User-Agent': 'DiscordTechNews/1.0 (RSS reader)'})
        with urlopen(request, timeout=20) as response:
            data = response.read(2_000_001)
        if len(data) > 2_000_000:
            raise ValueError('Flux trop volumineux')
        return parse_feed(data, category['name'], now, config['allowed_domains'], config.get('excluded_pattern')), True
    except (HTTPError, URLError, TimeoutError, OSError, ValueError, ET.ParseError):
        print('Flux indisponible : ' + category['name'], file=sys.stderr)
        return [], False


def due_slot(now, completed, hours):
    local = now.astimezone(ZoneInfo('Europe/Paris'))
    for hour in reversed(sorted(hours)):
        target = local.replace(hour=hour, minute=0, second=0, microsecond=0)
        key = target.strftime('%Y-%m-%dT%H')
        if timedelta(0) <= local - target < timedelta(minutes=120) and key not in completed:
            return key
    return None


def select_digest(articles, categories, sent):
    chosen = []
    for category in categories:
        for article in articles:
            if article['category'] == category['name'] and not known(article, sent + chosen):
                chosen.append(article)
                break
    return chosen


def select_alert(articles, sent, config, now, started_at):
    cutoff = max(now - timedelta(hours=3), datetime.fromisoformat(started_at))
    for a in articles:
        if datetime.fromisoformat(a['published']) < cutoff or known(a, sent):
            continue
        if not re.search(config['major_pattern'], a['title'], re.IGNORECASE):
            continue
        for b in articles:
            if (a['domain'] != b['domain'] and datetime.fromisoformat(b['published']) >= cutoff
                    and same_story(a['title'], b['title'])):
                return [a, b]
    return []


def payload(articles, heading):
    embeds = []
    for article in articles:
        embeds.append({'title': article['title'][:240], 'url': article['url'],
                       'description': f"**{article['category'][:80]}** · {article['publisher'][:80]}",
                       'color': 5793266, 'timestamp': article['published']})
    return {'username': 'Le Radar Tech', 'content': heading, 'embeds': embeds,
            'allowed_mentions': {'parse': []}}


def send(body):
    webhook = os.environ.get('DISCORD_WEBHOOK_URL', '')
    parsed = urlparse(webhook)
    if parsed.scheme != 'https' or parsed.hostname not in {'discord.com', 'discordapp.com'} or not re.fullmatch(r'/api/webhooks/\d+/[\w-]+', parsed.path):
        raise RuntimeError('Secret DISCORD_WEBHOOK_URL absent ou invalide.')
    # wait=true : Discord confirme la création du message avant de marquer les articles.
    endpoint = webhook.split('?')[0] + '?wait=true'
    data = json.dumps(body, ensure_ascii=False).encode('utf-8')
    for attempt in range(3):
        request = Request(endpoint, data=data, headers={'Content-Type': 'application/json', 'User-Agent': 'DiscordTechNews/1.0'}, method='POST')
        try:
            with urlopen(request, timeout=20) as response:
                response.read()
            return
        except HTTPError as error:
            if error.code == 429 and attempt < 2:
                try:
                    delay = float(json.loads(error.read()).get('retry_after', 5))
                except (ValueError, TypeError):
                    delay = 5
                time.sleep(max(1, min(delay, 30)))
                continue
            raise RuntimeError(f'Discord a refusé le message (HTTP {error.code}).') from None
        except (URLError, TimeoutError, OSError):
            # Ne pas réessayer automatiquement un envoi dont le résultat est ambigu.
            raise RuntimeError('Erreur réseau Discord ; vérifier le salon avant de relancer.') from None


def load_state(path, now):
    if path.exists():
        state = json.loads(path.read_text(encoding='utf-8'))
        if state.get('version') != 1:
            raise RuntimeError('Version d’historique non reconnue.')
        return state
    return {'version': 1, 'started_at': now.isoformat(), 'sent': [], 'digests': [], 'alerts': []}


def save_state(path, state):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(state, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true', help='Aucun envoi ni modification d’historique')
    parser.add_argument('--test-message', action='store_true', help='Envoie seulement un message de connexion')
    args = parser.parse_args()
    if args.test_message:
        body = {'content': '✅ Le Radar Tech est connecté ! Récapitulatifs prévus à 9 h et 18 h (Paris).', 'allowed_mentions': {'parse': []}}
        if args.dry_run:
            print(json.dumps(body, ensure_ascii=False))
        else:
            send(body)
        return
    now = datetime.now(UTC)
    config = json.loads((ROOT / 'config.json').read_text(encoding='utf-8'))
    path = ROOT / 'data/state.json'
    state = load_state(path, now)
    state['sent'] = [s for s in state['sent'] if datetime.fromisoformat(s['sent_at']) > now - timedelta(days=7)]
    state['digests'] = state['digests'][-16:]
    state['alerts'] = [s for s in state['alerts'] if datetime.fromisoformat(s) > now - timedelta(days=1)]
    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(lambda c: fetch_category(c, config, now), config['categories']))
    if not any(ok for _, ok in results):
        raise RuntimeError('Tous les flux sont indisponibles : aucun envoi.')
    articles = sorted([a for batch, _ in results for a in batch], key=lambda a: a['published'], reverse=True)
    slot = due_slot(now, state['digests'], config['digest_hours'])
    posts = []
    if slot or args.dry_run:
        selected = select_digest(articles, config['categories'], state['sent'])
        if selected:
            posts.append((payload(selected, '📰 **Le Radar Tech — ' + now.astimezone(ZoneInfo('Europe/Paris')).strftime('%d/%m/%Y %H:%M') + '**\nUne actualité par rubrique disponible.'), selected, slot, False))
        elif slot:
            print('Aucune nouvelle actualité sélectionnée pour ' + slot)
            state['digests'].append(slot)
    elif len(state['alerts']) < config['max_alerts_per_day']:
        last_alert = datetime.fromisoformat(state['alerts'][-1]) if state['alerts'] else now - timedelta(days=1)
        if now - last_alert >= timedelta(hours=2):
            selected = select_alert(articles, state['sent'], config, now, state['started_at'])
            if selected:
                posts.append((payload(selected, '🚨 **À la une tech**\nSignal détecté dans au moins deux médias ; consultez les sources.'), selected, None, True))
    for body, selected, digest, alert in posts:
        if args.dry_run:
            print(json.dumps(body, ensure_ascii=False, indent=2))
            continue
        send(body)
        for article in selected:
            state['sent'].append({**article, 'sent_at': now.isoformat()})
        if digest:
            state['digests'].append(digest)
        if alert:
            state['alerts'].append(now.isoformat())
        save_state(path, state)
    if not args.dry_run:
        save_state(path, state)
    print(f'Veille terminée : {len(articles)} articles, {len(posts)} message(s).')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, ValueError, OSError) as error:
        # Pas de trace d’erreur réseau pouvant contenir l’URL secrète du webhook.
        print('Erreur : ' + str(error), file=sys.stderr)
        sys.exit(1)
