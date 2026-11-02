"""Coordinator-side source retrieval, used when a CLI researcher cannot reach the web (off with COUNCIL_COORDINATOR_FETCH=0).

When a CLI researcher cannot reach the web, the model proposes candidate URLs as data and the
coordinator fetches them with bounded size and time. Only pages that actually load become source
notes, so every citation in the research record refers to text that was retrieved.
"""
import html
import ipaddress
import os
import re
import socket
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from urllib.parse import urlsplit
from .contracts import obj, STR

CANDIDATES = obj({'urls': {'type': 'array', 'items': obj({'url': STR, 'why': STR})}})
MAX_BYTES = 600_000
EXCERPT = 3500


def enabled():
    return os.environ.get('COUNCIL_COORDINATOR_FETCH', '1') != '0'


class _Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts, self.title, self._skip, self._in_title = [], '', 0, False

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'nav', 'footer', 'header', 'noscript'):
            self._skip += 1
        self._in_title = tag == 'title'

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'nav', 'footer', 'header', 'noscript') and self._skip:
            self._skip -= 1
        self._in_title = False

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        elif not self._skip:
            self.parts.append(data)


# Model-proposed addresses must be public web pages, never this Mac, the local network or a company intranet.
PRIVATE_SUFFIXES = ('.local', '.internal', '.corp', '.apple.com', '.localhost')


def resolve(host):
    """The addresses a host name resolves to here, or [] when it cannot be resolved locally."""
    try:
        return [info[4][0] for info in socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)]
    except (OSError, UnicodeError):
        return []


def public(url, lookup=None):
    """True for an https address on a public host. A name that resolves to any private, loopback or link-local
    address is refused (names such as 127.0.0.1.nip.io); a name that cannot be resolved here is allowed, since a
    proxy then resolves it, and the suffix rules still apply."""
    try:
        parts = urlsplit(url)
        host = (parts.hostname or '').rstrip('.').lower()
    except ValueError:
        return False
    if parts.scheme != 'https' or not host or host == 'localhost' or host.endswith(PRIVATE_SUFFIXES):
        return False
    try:
        # inet_aton also reads the short and numeric forms (127.1, 2130706433) that resolvers accept.
        address = ipaddress.ip_address(host if ':' in host else socket.inet_aton(host))
    except (OSError, ValueError):
        if '.' not in host:
            return False
        addresses = []
        for value in (lookup or resolve)(host):
            try:
                addresses.append(ipaddress.ip_address(value.split('%')[0]))
            except ValueError:
                return False
        return all(a.is_global for a in addresses)
    return address.is_global


class _PublicRedirects(urllib.request.HTTPRedirectHandler):
    """Follows a redirect only to another public https address."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return super().redirect_request(req, fp, code, msg, headers, newurl) if public(newurl) else None


OPENER = urllib.request.build_opener(_PublicRedirects)


def fetch(url, opener=OPENER.open, timeout=15):
    """Return (title, text) for an HTML or plain-text page on a public host, or None if it cannot be read."""
    if not re.fullmatch(r'https://[^\s<>"]{4,300}', url) or not public(url):
        return None
    request = urllib.request.Request(url, headers={'User-Agent': 'IntuitionLab/1.0 (educational research; github.com/eman2XR/intuition-lab)'})
    try:
        with opener(request, timeout=timeout) as response:
            if not public(response.geturl() if hasattr(response, 'geturl') else url):
                return None
            kind = response.headers.get('Content-Type', '')
            if not ('html' in kind or 'text/plain' in kind):
                return None
            raw = response.read(MAX_BYTES)
    except Exception:
        return None
    body = raw.decode('utf-8', errors='replace')
    if 'html' in kind:
        parser = _Text()
        parser.feed(body)
        title, text = parser.title.strip(), ' '.join(parser.parts)
    else:
        title, text = url, body
    text = re.sub(r'\s+', ' ', html.unescape(text)).strip()
    return (title or url, text) if len(text) > 400 else None


def retrieve(provider, question, opener=OPENER.open, limit=6):
    """Ask the model for candidate sources, fetch them, and return notes built only from retrieved text."""
    candidates = provider.generate('source_finder', question + '\nList up to eight specific, stable web pages '
        '(the original paper when the question names one, university, government, encyclopedia, or open educational '
        'resources; https only) that explain this '
        'question reliably. Prefer pages that are plain HTML. Return URLs only as data.', CANDIDATES)
    retrieved = []
    for item in candidates.get('urls', [])[:8]:
        page = fetch(item.get('url', ''), opener)
        if page:
            retrieved.append({'url': item['url'], 'title': page[0][:160], 'text': page[1][:EXCERPT]})
        if len(retrieved) >= limit:
            break
    if not retrieved:
        raise RuntimeError('Coordinator could not retrieve any candidate source; refusing unsourced research.')
    stamp = datetime.now(timezone.utc).isoformat(timespec='seconds')
    notes = '\n\n'.join(f'SOURCE (retrieved by the coordinator {stamp}): {r["url"]}\nTITLE: {r["title"]}\nEXCERPT: {r["text"]}'
                        for r in retrieved)
    return notes, [r['url'] for r in retrieved]
