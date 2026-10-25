import { test } from 'node:test';
import assert from 'node:assert/strict';
import { intersection, separated } from '../../scripts/lab/artwork-geometry.mjs';

test('recorded 10.10.6 logo/poster collision fails the regression guard', () => {
  // Actual Chrome 1920x1080 fixture A, pre-fix build 7985d738.
  const logo = { x: 65.265625, y: 129.59375, width: 440, height: 129.59375 };
  const poster = { x: 65.265625, y: 248.390625, width: 300, height: 450 };
  assert.equal(separated(logo, poster), false);
  assert.equal(intersection(logo, poster).height, 10.796875);
});

test('artwork guard checks both axes and excludes invisible or absent artwork', () => {
  const logo = { x: 30, y: 90, width: 300, height: 100 };
  assert.equal(separated(logo, { x: 30, y: 210, width: 300, height: 450 }), true);
  assert.equal(separated(logo, { x: 350, y: 90, width: 500, height: 100 }), true);
  assert.equal(separated(logo, { ...logo, display: 'none' }), true);
  assert.equal(separated(logo, null), true);
  assert.equal(separated(logo, { ...logo, width: 0 }), true);
  assert.equal(separated(logo, { ...logo, x: 329.5 }), true);
  assert.equal(separated(logo, { ...logo, x: 328 }), false);
});
