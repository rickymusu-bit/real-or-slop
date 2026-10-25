import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock
from pipeline.run import connect,ingest,rights_check,queries
from pipeline.providers import PROVIDERS,Client
class PipelineTest(unittest.TestCase):
    def setUp(self): self.row=json.loads(Path('pipeline/fixtures.json').read_text())[0]
    def test_dedup_and_never_approve(self):
        with tempfile.TemporaryDirectory() as d:
            db=connect(Path(d)/'queue'); config={'max_results':5}
            self.assertEqual(ingest(db,[self.row,self.row],config,folder=Path(d)),1)
            self.assertEqual(ingest(db,[self.row],config,folder=Path(d)),0)
            self.assertEqual(json.loads(db.execute('SELECT metadata FROM candidates').fetchone()[0])['status'],'in-review')
    def test_ambiguous_rights_and_missing_author(self):
        self.assertEqual(rights_check(self.row),'eligible-needs-review')
        self.assertEqual(rights_check({**self.row,'rights':'NASA'}),'ambiguous')
        self.assertEqual(rights_check({**self.row,'author':''}),'incomplete')
    def test_all_official_connectors_with_empty_mock(self):
        c=Mock(); c.get.return_value={}
        import os
        from unittest.mock import patch
        with patch.dict(os.environ,{'SMITHSONIAN_API_KEY':'fixture'}):
            for p in PROVIDERS.values(): self.assertEqual(list(p.search(c,'bridge',3)),[])
    def test_queries_bounded(self): self.assertEqual(len(queries({'subject':'bridge','variants':['a','b','c','d']})),4)
    def test_contact_required(self):
        with self.assertRaises(ValueError): Client('bot')

class ProviderMappingTest(unittest.TestCase):
    def test_asset_fields_from_each_provider(self):
        from unittest.mock import patch
        import os
        cases={
          'commons':[{'query':{'pages':{'1':{'pageid':1,'title':'Bridge','imageinfo':[{'url':'https://example.invalid/img','descriptionurl':'https://example.invalid/source','extmetadata':{'Artist':{'value':'Author'},'LicenseUrl':{'value':'https://creativecommons.org/licenses/by/4.0/'}}}]}}}}],
          'openverse':[{'results':[{'id':'v1','title':'Bridge','foreign_landing_url':'https://example.invalid/source','url':'https://example.invalid/img','creator':'Author','license_url':'https://creativecommons.org/licenses/by/4.0/'}]}],
          'met':[{'objectIDs':[1]},{'title':'Bridge','objectURL':'https://example.invalid/source','primaryImage':'https://example.invalid/img','artistDisplayName':'Author','isPublicDomain':False}],
          'loc':[{'results':[{'id':'https://www.loc.gov/item/123/','title':'Bridge','image_url':['https://example.invalid/img']}]},{'item':{'contributor':['Author'],'rights_advisory':'Rights unknown'}}],
          'smithsonian':[{'response':{'rows':[{'id':'s1','title':'Bridge','content':{'descriptiveNonRepeating':{'record_link':'https://example.invalid/source','online_media':{'media':[{'content':'https://example.invalid/img','usage':{'access':'CC0'}}]}},'freetext':{'name':['Author']}}}]}}],
          'nasa':[{'collection':{'items':[{'data':[{'nasa_id':'n1','title':'Bridge','center':'NASA'}],'links':[{'rel':'preview','href':'https://example.invalid/img'}]}]}}]
        }
        with patch.dict(os.environ,{'SMITHSONIAN_API_KEY':'fixture-only'}):
            for name,responses in cases.items():
                with self.subTest(provider=name):
                    client=Mock();client.get.side_effect=responses
                    rows=list(PROVIDERS[name].search(client,'bridge',1))
                    self.assertEqual(len(rows),1)
                    self.assertEqual(rows[0]['title'],'Bridge')
                    self.assertEqual(rows[0]['status'],'in-review')
                    self.assertTrue(rows[0]['author'])
                    if name=='met':self.assertEqual(rows[0]['rights'],'')
                    if name=='nasa':self.assertEqual(rights_check(rows[0]),'ambiguous')
    def test_rate_limit_retry_and_contact_header(self):
        import io
        from urllib.error import HTTPError
        opener=Mock(side_effect=[HTTPError('https://example.invalid',429,'limited',{'Retry-After':'2'},None),io.BytesIO(b'{"ok": true}')])
        sleep=Mock();client=Client('RealOrSlop/1 (editor@example.invalid)',opener=opener,sleep=sleep)
        self.assertEqual(client.get('https://example.invalid'),{'ok':True})
        self.assertEqual(opener.call_count,2)
        self.assertIn('editor@example.invalid',opener.call_args.args[0].get_header('User-agent'))
        sleep.assert_any_call(2)
