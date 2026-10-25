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
