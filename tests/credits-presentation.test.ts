import test from 'node:test';
import assert from 'node:assert/strict';
import {hasCredits, formatCredits} from '../src/lib/personal-chat/presentation';

test('only finite nonnegative provider amounts are presented as credit usage', () => {
  for (const value of [undefined, null, NaN, Infinity, -Infinity, -1, '2', {}, true]) assert.equal(hasCredits(value), false);
  for (const value of [0, 0.125, 4]) assert.equal(hasCredits(value), true);
  assert.equal(formatCredits(0.125), '0,125');
});
