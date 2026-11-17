import {test} from 'node:test';
import assert from 'node:assert/strict';
import {signPreview, readPreview, PREVIEW_TTL_MS, type PreviewSelection} from '../worker/slop-preview';
import type {Env} from '../worker/core';
const env = {ADMIN_TOKEN:'fixture-preview-owner-key-at-least-32-characters'} as Env;
const selected: PreviewSelection = {version:1,id:'preview-batch',expires:1000+PREVIEW_TTL_MS,
  sources:[{id:'real-a',revision:4},{id:'real-b',revision:2}],
  config:{max_generation_attempts:3,editorial_tolerance:1,text_model:'fake-text',image_model:'fake-image',quality:'medium'}};
test('preview binds the ordered references, revisions and call configuration to the owner key', async () => {
  const token = await signPreview(env, selected);
  assert.deepEqual(await readPreview(env, token, 1000), selected);
  const [body,sig] = token.split('.');
  const changed = (body[0] === 'e' ? 'f' : 'e') + body.slice(1) + '.' + sig;
  await assert.rejects(readPreview(env, changed, 1000), /non valida/);
  await assert.rejects(readPreview({ADMIN_TOKEN:'different-fixture-owner-key-32-characters'} as Env, token, 1000), /non valida/);
  await assert.rejects(readPreview(env, token, selected.expires), /scaduta/);
  for (const malformed of [undefined, '', 'missing.signature', token+'.extra'])
    await assert.rejects(readPreview(env, malformed, 1000));
});
test('even a signed malformed selection cannot change the quantity or contain duplicate references', async () => {
  for (const sources of [[], [...selected.sources,selected.sources[0]], [{id:'real-a',revision:-1}]]) {
    const token=await signPreview(env,{...selected,sources});
    await assert.rejects(readPreview(env,token,1000),/non valida/);
  }
});
