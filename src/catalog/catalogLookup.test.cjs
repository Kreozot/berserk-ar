const test = require('node:test');
const assert = require('node:assert/strict');

const { findById } = require('../../.test-dist/src/catalog/catalogLookup.js');

test('findById returns the matching object and undefined when absent', () => {
  const items = [{ id: 'a', value: 1 }, { id: 'b', value: 2 }];
  assert.equal(findById(items, 'b'), items[1]);
  assert.equal(findById(items, 'missing'), undefined);
});
