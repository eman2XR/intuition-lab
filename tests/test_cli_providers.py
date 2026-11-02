import json
import sys
import tempfile
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch
from lab.cli_providers import CLIProvider, WorkerLimitError, parse_events, failure_detail
from lab.contracts import REVIEW_SCHEMA

REVIEW={'pass':True,'score':8,'summary':'Image inspected','changes':[],'blocking_issues':[]}


class CLIAdapterTests(unittest.TestCase):
    def adapter(self,name='codex',**kwargs):
        return CLIProvider(name,executable=sys.executable,**kwargs)

    def test_codex_images_schema_and_result(self):
        with tempfile.TemporaryDirectory() as tmp, patch('lab.cli_providers.ROOT',Path(tmp)):
            image=Path(tmp)/'frame.png';image.write_bytes(b'image')
            provider=self.adapter()
            def execute(argv,stdin,cwd,*rest):
                self.assertIn('--image',argv)
                self.assertEqual(argv[argv.index('--image')+1],str(image.resolve()))
                self.assertEqual(argv[argv.index('--sandbox')+1],'read-only')
                self.assertEqual(json.loads(Path(argv[argv.index('--output-schema')+1]).read_text()),REVIEW_SCHEMA)
                Path(argv[argv.index('--output-last-message')+1]).write_text(json.dumps(REVIEW))
                return 'banner\n'+json.dumps({'type':'turn.completed','usage':{'output_tokens':22}})
            with patch.object(provider,'_execute',side_effect=execute):
                self.assertEqual(provider.generate('reviewer','test',REVIEW_SCHEMA,[image]),REVIEW)
            self.assertEqual(provider.calls,1)
            self.assertEqual(provider.usage[0]['turns'][0]['output_tokens'],22)
            self.assertEqual(list((Path(tmp)/'.council-runtime').iterdir()),[])

    def test_claude_native_image_input_and_structured_output(self):
        with tempfile.TemporaryDirectory() as tmp, patch('lab.cli_providers.ROOT',Path(tmp)):
            image=Path(tmp)/'frame.png';image.write_bytes(b'image')
            provider=self.adapter('claude')
            def execute(argv,stdin,cwd,*rest):
                content=json.loads(stdin)['message']['content']
                self.assertEqual(content[1]['type'],'image')
                self.assertEqual(content[1]['source']['data'],'aW1hZ2U=')
                self.assertEqual(argv[argv.index('--tools')+1],'')
                self.assertNotIn('--dangerously-skip-permissions',argv)
                self.assertEqual(json.loads(argv[argv.index('--json-schema')+1]),REVIEW_SCHEMA)
                return json.dumps({'type':'result','subtype':'success','is_error':False,'structured_output':REVIEW})
            with patch.object(provider,'_execute',side_effect=execute):
                self.assertEqual(provider.generate('reviewer','test',REVIEW_SCHEMA,[image]),REVIEW)

    def test_claude_research_has_only_web_tools(self):
        provider=self.adapter('claude')
        with tempfile.TemporaryDirectory() as tmp, patch('lab.cli_providers.ROOT',Path(tmp)):
            def execute(argv,*args):
                self.assertEqual(argv[argv.index('--tools')+1],'WebSearch,WebFetch')
                return json.dumps({'type':'assistant','message':{'content':[{'type':'tool_use','name':'WebFetch'}]}})+'\n'+\
                    json.dumps({'type':'user','message':{'content':[{'type':'tool_result','is_error':False,'content':'Page text '*40}]}})+'\n'+\
                    json.dumps({'type':'result','subtype':'success','result':'Retrieved source notes'})
            with patch.object(provider,'_execute',side_effect=execute):
                self.assertEqual(provider.generate('researcher','test',research=True),'Retrieved source notes')

    def test_claude_research_with_only_failed_fetches_is_rejected(self):
        provider=self.adapter('claude')
        with tempfile.TemporaryDirectory() as tmp, patch('lab.cli_providers.ROOT',Path(tmp)):
            def execute(argv,*args):
                return json.dumps({'type':'assistant','message':{'content':[{'type':'tool_use','name':'WebFetch'}]}})+'\n'+\
                    json.dumps({'type':'user','message':{'content':[{'type':'tool_result','is_error':True,'content':'proxy refused the connection'}]}})+'\n'+\
                    json.dumps({'type':'result','subtype':'success','result':'Notes from memory'})
            with patch.object(provider,'_execute',side_effect=execute):
                with self.assertRaisesRegex(RuntimeError,'retrieved no source content'):
                    provider.generate('researcher','test',research=True)

    def test_claude_failures_and_missing_schema_are_rejected(self):
        for result in [{'type':'result','subtype':'error_max_turns','is_error':True},
                       {'type':'result','subtype':'success','result':'unstructured'}]:
            with tempfile.TemporaryDirectory() as tmp, patch('lab.cli_providers.ROOT',Path(tmp)):
                provider=self.adapter('claude')
                with patch.object(provider,'_execute',return_value=json.dumps(result)):
                    with self.assertRaises(RuntimeError):provider.generate('reviewer','test',REVIEW_SCHEMA)

    def test_atomic_call_budget_under_concurrency(self):
        with tempfile.TemporaryDirectory() as tmp, patch('lab.cli_providers.ROOT',Path(tmp)):
            provider=self.adapter('claude',max_calls=1)
            with patch.object(provider,'_execute',return_value=json.dumps({'type':'result','subtype':'success','result':'notes'})):
                with ThreadPoolExecutor(max_workers=2) as pool:
                    futures=[pool.submit(provider.generate,'researcher','test') for _ in range(2)]
                    values=[]
                    for f in futures:
                        try:values.append(f.result())
                        except WorkerLimitError:values.append('bounded')
                self.assertCountEqual(values,['notes','bounded'])

    def test_timeout_terminates_real_subprocess(self):
        provider=self.adapter(timeout=.15)
        start=time.monotonic()
        with self.assertRaises(WorkerLimitError):
            provider._execute([sys.executable,'-c','import time;time.sleep(30)'],'',Path.cwd())
        self.assertLess(time.monotonic()-start,3)
        self.assertEqual(len(provider._processes),0)

    def test_only_four_workers_execute_at_once(self):
        with tempfile.TemporaryDirectory() as tmp, patch('lab.cli_providers.ROOT',Path(tmp)):
            provider=self.adapter('claude',max_calls=6)
            active=peak=0
            lock=threading.Lock()
            def execute(*args):
                nonlocal active,peak
                with lock:
                    active+=1;peak=max(peak,active)
                time.sleep(.03)
                with lock:active-=1
                return json.dumps({'type':'result','subtype':'success','result':'notes'})
            with patch.object(provider,'_execute',side_effect=execute):
                with ThreadPoolExecutor(max_workers=6) as pool:
                    results=list(pool.map(lambda _:provider.generate('scientist','test'),range(6)))
            self.assertEqual(results,['notes']*6)
            self.assertEqual(peak,4)

    def test_cancel_stops_active_worker(self):
        provider=self.adapter(timeout=30)
        with ThreadPoolExecutor(max_workers=1) as pool:
            future=pool.submit(provider._execute,[sys.executable,'-c','import time;time.sleep(30)'],'',Path.cwd())
            end=time.monotonic()+2
            while not provider._processes and time.monotonic()<end:time.sleep(.01)
            provider.cancel()
            with self.assertRaises(RuntimeError):future.result(timeout=2)
        with self.assertRaises(WorkerLimitError):provider.remaining()

    def test_global_deadline_and_invalid_limits(self):
        provider=self.adapter();provider.deadline=time.monotonic()-1
        with self.assertRaises(WorkerLimitError):provider.generate('test','test')
        with self.assertRaises(ValueError):self.adapter(timeout=float('nan'))

    def test_wrapper_banners_do_not_break_event_parser(self):
        self.assertEqual(parse_events('banner\n{}\n[1]\n{"type":"result"}\n'),[{}, {'type':'result'}])

    def test_managed_gateway_error_has_actionable_safe_message(self):
        result={'type':'result','is_error':True,'subtype':'success','api_error_status':502,
                'result':'API Error: ENOTFOUND floodgate.example. no working route. secret=do-not-print'}
        detail=failure_detail(json.dumps(result))
        self.assertIn('VPN/network',detail)
        self.assertNotIn('do-not-print',detail)

if __name__=='__main__':unittest.main()
