const { chunk } = require('../src/common')

test('chunk less than size', () => {
  expect(chunk("hello world, tis me", 42)).toEqual(["hello world, tis me"]);
});

test('chunk greater than size', () => {
  expect(chunk("hello world, tis me", 12)).toEqual(["hello world,", " tis me"]);
});

