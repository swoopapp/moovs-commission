import assert from 'node:assert/strict';
import { mapWithConcurrency } from '../src/lib/concurrency.ts';

let active = 0;
let maximumActive = 0;
const values = Array.from({ length: 9 }, (_, index) => index);

const results = await mapWithConcurrency(values, 2, async (value) => {
  active += 1;
  maximumActive = Math.max(maximumActive, active);
  await new Promise((resolve) => setTimeout(resolve, value % 2 ? 4 : 1));
  active -= 1;
  return value * 2;
});

assert.deepEqual(results, values.map((value) => value * 2));
assert.equal(maximumActive, 2);
assert.deepEqual(await mapWithConcurrency([], 2, async (value) => value), []);

console.log('Dashboard concurrency verification passed (3 assertions).');
