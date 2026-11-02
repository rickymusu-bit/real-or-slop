"""Explicit local simulation only. Never used as a fallback for API failures."""
import base64
import copy
import io
import json
from pathlib import Path
import random
import uuid
from PIL import Image
from .editorial import FixtureOpenAI


class FixtureBatch:
    def __init__(self): self.files={};self.batches={};self.oracle=FixtureOpenAI()
    def check_models(self,cfg):pass
    def upload_jsonl(self,path):
        uid='file-'+uuid.uuid4().hex;self.files[uid]=[json.loads(line) for line in Path(path).read_text().splitlines()];return uid
    def create_batch(self,file_id,endpoint,metadata):
        uid='batch-'+uuid.uuid4().hex;output='file-'+uuid.uuid4().hex;results=[]
        for row in self.files[file_id]:
            body=row['body']
            if endpoint=='/v1/responses':
                parts=body['input'][0]['content'];text=parts[0]['text'];instructions,_,context=text.partition('\nDati separati della fonte/feedback:\n')
                value=self.oracle.vision(body['model'],instructions,base64.b64decode(parts[1]['image_url'].split(',',1)[1]),context)
                result={'output':[{'content':[{'type':'output_text','text':json.dumps(value)}]}],'usage':{'input_tokens':30,'output_tokens':50}}
            else:
                raw=io.BytesIO();Image.frombytes('RGB',(32,24),random.Random(row['custom_id']).randbytes(32*24*3)).save(raw,format='PNG')
                result={'data':[{'b64_json':base64.b64encode(raw.getvalue()).decode()}]}
            results.append(dict(custom_id=row['custom_id'],error=None,response=dict(status_code=200,request_id='fixture-request',body=result)))
        self.files[output]=list(reversed(results))  # The provider does not preserve request order.
        self.batches[uid]=dict(id=uid,status='completed',metadata=metadata,input_file_id=file_id,endpoint=endpoint,output_file_id=output,error_file_id=None)
        return copy.deepcopy(self.batches[uid])
    def retrieve(self,uid):return copy.deepcopy(self.batches[uid])
    def find_submission(self,metadata,file_id):return next((copy.deepcopy(row) for row in self.batches.values() if row['metadata']==metadata and row['input_file_id']==file_id),None)
    def cancel(self,uid):self.batches[uid]['status']='cancelled';return self.retrieve(uid)
    def lines(self,file_id):yield from copy.deepcopy(self.files[file_id])
