import assert from 'node:assert/strict';
import { batchEncodedQueryValues } from '../src/lib/query-batching.ts';

const ids = Array.from(
  { length: 125 },
  (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
);
const batches = batchEncodedQueryValues(ids);

assert.ok(batches.length > 1);
assert.deepEqual(batches.flat(), ids);
assert.ok(batches.every((batch) => (
  batch.map(encodeURIComponent).join(',').length <= 900
)));
assert.deepEqual(batchEncodedQueryValues([]), []);

console.log(`Query batching verification passed (4 assertions across ${batches.length} batches).`);
