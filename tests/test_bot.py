from datetime import datetime, timedelta, timezone
import json
import hashlib
import unittest
from unittest.mock import patch

import bot

NOW = datetime(2026, 10, 16, 12, tzinfo=timezone.utc)


def article(title='Une faille critique touche le navigateur Chrome Windows', domain='numerama.com', **kwargs):
    return dict(title=title, domain=domain, url='https://' + domain + '/' + hashlib.sha256(title.encode()).hexdigest(),
                publisher=domain, published=(NOW - timedelta(minutes=10)).isoformat(),
                category=kwargs.get('category', 'Cyber'))


class BotTests(unittest.TestCase):
    def test_paris_summer_and_winter(self):
        # 9 h Paris = 7 h UTC en été, 8 h UTC en hiver.
        self.assertEqual(bot.due_slot(datetime(2026, 7, 1, 7, tzinfo=timezone.utc), [], [9, 18]), '2026-07-01T09')
        self.assertEqual(bot.due_slot(datetime(2026, 12, 1, 8, tzinfo=timezone.utc), [], [9, 18]), '2026-12-01T09')
        self.assertIsNone(bot.due_slot(datetime(2026, 12, 1, 7, 59, tzinfo=timezone.utc), [], [9, 18]))

    def test_slots_no_repeat_and_late_catchup(self):
        now = datetime(2026, 10, 16, 7, 35, tzinfo=timezone.utc)
        self.assertEqual(bot.due_slot(now, [], [9, 18]), '2026-10-16T09')
        self.assertIsNone(bot.due_slot(now, ['2026-10-16T09'], [9, 18]))
        self.assertEqual(bot.due_slot(now + timedelta(hours=2), [], [9, 18]), '2026-10-16T09')
        self.assertEqual(bot.due_slot(datetime(2026, 10, 17, 9, 16, tzinfo=timezone.utc), [], [9, 18]), '2026-10-17T09')
        evening = datetime(2026, 10, 17, 17, 40, tzinfo=timezone.utc)
        self.assertEqual(bot.due_slot(evening, [], [9, 18]), '2026-10-17T18')
        self.assertIsNone(bot.due_slot(evening, ['2026-10-17T18'], [9, 18]))
        self.assertIsNone(bot.due_slot(datetime(2026, 10, 18, 1, tzinfo=timezone.utc), [], [9, 18]))

    def test_feed_dates_publishers_html_and_https(self):
        item = '''<item><title><![CDATA[Une &amp; nouvelle - Numerama]]></title>
        <link>https://news.google.com/rss/articles/abc</link>
        <pubDate>Fri, 16 Oct 2026 11:50:00 GMT</pubDate>
        <source url="https://www.numerama.com">Numerama</source></item>'''
        rss = ('<rss><channel>' + item + '</channel></rss>').encode()
        result = bot.parse_feed(rss, 'IA', NOW, ['numerama.com'])
        self.assertEqual(result[0]['title'], 'Une & nouvelle')
        self.assertEqual(bot.parse_feed(rss, 'IA', NOW, ['autre.fr']), [])
        self.assertEqual(bot.parse_feed(rss, 'IA', NOW + timedelta(days=2), ['numerama.com']), [])
        self.assertEqual(bot.parse_feed(rss.replace(b'https://news.', b'http://news.'), 'IA', NOW, ['numerama.com']), [])
        self.assertEqual(bot.parse_feed(rss.replace(b'www.numerama.com', b'evilnumerama.com'), 'IA', NOW, ['numerama.com']), [])
        self.assertEqual(bot.parse_feed(rss, 'IA', NOW, ['numerama.com'], 'nouvelle'), [])

    def test_digest_dedup_across_categories_and_previous_posts(self):
        a = article(category='Cyber')
        b = article(domain='clubic.com', category='Logiciels')
        c = article('Microsoft lance une nouvelle mise à jour de Windows', category='Logiciels')
        categories = [{'name': 'Cyber'}, {'name': 'Logiciels'}]
        chosen = bot.select_digest([a, b, c], categories, [])
        self.assertEqual(chosen, [a, c])
        self.assertEqual(bot.select_digest([a, b], categories, [a]), [])

    def test_alert_requires_two_publishers_and_starts_after_boot(self):
        config = {'major_pattern': 'faille critique'}
        started = (NOW - timedelta(hours=1)).isoformat()
        a, b = article(), article(domain='clubic.com')
        self.assertEqual(bot.select_alert([a], [], config, NOW, started), [])
        self.assertEqual(bot.select_alert([a, a], [], config, NOW, started), [])
        self.assertEqual(bot.select_alert([a, b], [], config, NOW, NOW.isoformat()), [])
        self.assertEqual(bot.select_alert([a, b], [], config, NOW, started), [a, b])
        self.assertEqual(bot.select_alert([a, b], [a], config, NOW, started), [])
        ordinary = article('Voici les nouveautés de Windows', domain='clubic.com')
        self.assertEqual(bot.select_alert([a, ordinary], [], config, NOW, started), [])

    def test_discord_size_and_mentions(self):
        config = json.loads((bot.ROOT / 'config.json').read_text(encoding='utf-8'))
        articles = [article('x' * 500, category=c['name']) for c in config['categories']]
        body = bot.payload(articles, 'Radar')
        self.assertEqual(body['allowed_mentions'], {'parse': []})
        self.assertLess(sum(len(e['title']) + len(e['description']) for e in body['embeds']), 6000)
        with patch.dict('os.environ', {'DISCORD_WEBHOOK_URL': 'https://evil.example/api/webhooks/1/token'}):
            with self.assertRaisesRegex(RuntimeError, 'invalide'):
                bot.send(body)

    def test_failed_post_does_not_mark_as_sent(self):
        config = json.loads((bot.ROOT / 'config.json').read_text(encoding='utf-8'))
        state = {'version': 1, 'started_at': NOW.isoformat(), 'sent': [], 'digests': [], 'alerts': []}
        with patch.object(bot, 'load_state', return_value=state), patch.object(bot, 'save_state') as save, patch.object(bot, 'due_slot', return_value='slot'), patch.object(bot, 'fetch_category', return_value=([article(category=config['categories'][0]['name'])], True)), patch.object(bot, 'send', side_effect=RuntimeError('échec')), patch('sys.argv', ['bot.py']):
            with self.assertRaisesRegex(RuntimeError, 'échec'):
                bot.main()
        self.assertEqual(state['sent'], [])
        save.assert_not_called()

    def test_dry_run_never_posts_or_saves(self):
        with patch.object(bot, 'fetch_category', return_value=([article(category='🤖 Intelligence artificielle')], True)), patch.object(bot, 'send') as send, patch.object(bot, 'save_state') as save, patch('sys.argv', ['bot.py', '--dry-run']), patch('builtins.print'):
            bot.main()
        send.assert_not_called()
        save.assert_not_called()


if __name__ == '__main__':
    unittest.main()
