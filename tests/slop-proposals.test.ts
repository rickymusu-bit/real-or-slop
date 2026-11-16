import {test} from 'node:test';
import assert from 'node:assert/strict';
import {proposal, spreadPercent, type AutoInput} from '../shared/slop-proposals';
const input = (over: Partial<AutoInput> = {}): AutoInput => ({real:60, slop:0, pending:0, available:60, enabled:true, openBatch:false, ignoredMissing:null, ...over});
test('balance counts independent SLOP, including pending images before requesting more', () => {
  assert.equal(spreadPercent(0,0),null);
  assert.equal(proposal(input()).proposal?.size,10);
  assert.equal(proposal(input({slop:40})).proposal?.size,10);
  assert.equal(proposal(input({slop:59})).proposal?.size,1);
  assert.equal(proposal(input({slop:30,pending:26})).proposal?.size,4);
  assert.equal(proposal(input({slop:30,pending:30})).reason,'none');
  assert.equal(proposal(input({slop:70})).reason,'none');
  assert.equal(proposal(input({available:2})).proposal?.size,2);
});
test('proposal guards and ignore hysteresis', () => {
  for (const [over,reason] of [[{enabled:false},'disabled'],[{openBatch:true},'batch_open'],
    [{available:0},'none'],[{slop:30,ignoredMissing:30},'none']] as const) assert.equal(proposal(input(over)).reason,reason);
  assert.equal(proposal(input({slop:24,ignoredMissing:30})).proposal?.missing,36);
});
