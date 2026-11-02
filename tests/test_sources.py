import io
import os
import unittest
from unittest.mock import patch
from lab import sources


class Response(io.BytesIO):
    def __init__(self, body, kind='text/html'):
        super().__init__(body.encode());self.headers={'Content-Type':kind}
    def __enter__(self):return self
    def __exit__(self,*a):return False


class Finder:
    calls=0
    def generate(self,role,prompt,schema=None,**kw):
        return {'urls':[{'url':'https://good.example/page','why':'x'},{'url':'https://bad.example/x','why':'y'},
                        {'url':'http://insecure.example/','why':'z'},{'url':'https://pdf.example/a.pdf','why':'w'}]}


def opener(request,timeout):
    url=request.full_url
    if 'good' in url:
        return Response('<html><title>Good page</title><script>ignore()</script><p>'+'Interference adds waves. '*40+'</p></html>')
    if 'pdf' in url:
        return Response('%PDF','application/pdf')
    raise OSError('refused')


class SourceTests(unittest.TestCase):
    def test_only_pages_that_load_become_notes(self):
        notes,urls=sources.retrieve(Finder(),'Q?',opener)
        self.assertEqual(urls,['https://good.example/page'])
        self.assertIn('Good page',notes);self.assertNotIn('ignore()',notes);self.assertNotIn('bad.example',notes)

    def test_nothing_retrieved_is_refused(self):
        with self.assertRaises(RuntimeError):
            sources.retrieve(Finder(),'Q?',lambda r,timeout:(_ for _ in ()).throw(OSError('down')))

    def test_fallback_is_on_unless_turned_off(self):
        with patch.dict(os.environ,{},clear=True):self.assertTrue(sources.enabled())
        with patch.dict(os.environ,{'COUNCIL_COORDINATOR_FETCH':'0'}):self.assertFalse(sources.enabled())

    @patch('lab.sources.resolve',lambda host:['93.184.216.34'])
    def test_only_public_https_hosts_are_fetched_even_after_redirects(self):
        for url in ['https://127.0.0.1/x','https://127.1/x','https://2130706433/x','https://[::1]/x','https://10.1.2.3/x',
                    'https://169.254.169.254/latest','https://localhost/x','https://printer.local/x','https://wiki.corp/x',
                    'https://build.internal/x','https://confluence.corp.apple.com/x','https://intranet/x','http://good.example/x']:
            self.assertFalse(sources.public(url),url)
            self.assertIsNone(sources.fetch(url,opener),url)
        self.assertTrue(sources.public('https://arxiv.org/abs/2403.01234'))
        class Moved(Response):
            def geturl(self):return 'https://192.168.1.1/admin'
        page='<html><title>Moved</title><p>'+'Text. '*100+'</p></html>'
        self.assertIsNone(sources.fetch('https://good.example/page',lambda r,timeout:Moved(page)))
        self.assertIsNotNone(sources.fetch('https://good.example/page',lambda r,timeout:Response(page)))
        handler=sources._PublicRedirects()
        self.assertIsNone(handler.redirect_request(None,None,302,'Found',{},'https://localhost/admin'))


class KeepRetrievedTests(unittest.TestCase):
    def test_sources_marked_unretrieved_are_removed_and_noted(self):
        from lab.pipeline import keep_retrieved
        research={'sources':[{'url':'https://good.example/a','title':'','supports':''},{'url':'https://paywall.example/b','title':'','supports':''}],'limitations':[]}
        notes='Retrieved: https://good.example/a\n- Paper: https://paywall.example/b **[not retrieved]**'
        kept=keep_retrieved(research,notes)
        self.assertEqual([s['url'] for s in kept['sources']],['https://good.example/a'])
        self.assertIn('could not retrieve',kept['limitations'][-1])

    def test_words_inside_urls_and_other_pages_of_a_site_do_not_count(self):
        from lab.pipeline import keep_retrieved
        urls=['https://arxiv.org/abs/2403.01234','https://www.feynmanlectures.caltech.edu/I_29.html','https://example.edu/failed-stars',
              'https://journals.aps.org/prl/abstract/10.1103/PhysRevLett.13.789']
        research={'sources':[{'url':u,'title':'','supports':''} for u in urls],'limitations':[]}
        notes=('| Will (2014) | https://arxiv.org/abs/2403.01234 | Review of the tests. |\n'
               'Opened https://example.edu/failed-stars and https://www.feynmanlectures.caltech.edu/I_29.html\n'
               'HTTP 403: https://www.feynmanlectures.caltech.edu/\n'
               'Shapiro (1964): https://journals.aps.org/prl/abstract/10.1103/PhysRevLett.13.789. **[not retrieved]**')
        kept=keep_retrieved(research,notes)
        self.assertEqual([s['url'] for s in kept['sources']],urls[:3])
        self.assertEqual(kept['limitations'],['1 reference(s) the researcher could not retrieve were removed from the sources.'])
        # The arxiv source alone: kept, and no false "could not retrieve" note reaches the published limitations.
        alone=keep_retrieved({'sources':research['sources'][:1],'limitations':[]},notes.splitlines()[0])
        self.assertEqual((len(alone['sources']),alone['limitations']),(1,[]))




class ResolvedHostTests(unittest.TestCase):
    def test_names_that_resolve_to_private_addresses_are_refused(self):
        for addresses in (['127.0.0.1'],['169.254.169.254'],['10.0.0.5'],['93.184.216.34','192.168.1.1'],['::1'],['fe80::1%en0']):
            self.assertFalse(sources.public('https://127.0.0.1.nip.io/x',lambda host:addresses),addresses)
        self.assertTrue(sources.public('https://arxiv.org/abs/1',lambda host:['151.101.3.42','2a04:4e42::298']))
        # Behind a proxy a public name may not resolve locally; the proxy resolves it, so it stays allowed.
        self.assertTrue(sources.public('https://arxiv.org/abs/1',lambda host:[]))


if __name__=='__main__':unittest.main()
