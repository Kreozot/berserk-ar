import { describe, expect, it } from 'vitest';

import { findById } from './catalogLookup';

describe('findById', () => {
  it('returns the matching object', () => {
    const items = [
      { id: 'a', value: 1 },
      { id: 'b', value: 2 },
    ];

    expect(findById(items, 'b')).toBe(items[1]);
  });

  it('returns undefined when the id is absent', () => {
    expect(findById([{ id: 'a' }], 'missing')).toBeUndefined();
  });
});
