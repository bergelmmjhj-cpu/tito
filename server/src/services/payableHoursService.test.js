import test from "node:test";
import assert from "node:assert/strict";
import { computePayableHoursFromDuration } from "./payableHoursService.js";

const EXAMPLES = [
  [7 * 60 + 9, 7.0],
  [7 * 60 + 10, 7.25],
  [7 * 60 + 24, 7.25],
  [7 * 60 + 25, 7.5],
  [7 * 60 + 39, 7.5],
  [7 * 60 + 40, 7.75],
  [7 * 60 + 54, 7.75],
  [7 * 60 + 55, 8.0],
];

for (const [minutes, expected] of EXAMPLES) {
  const hours = Math.floor(minutes / 60);
  const remainder = String(minutes % 60).padStart(2, "0");

  test(`computePayableHoursFromDuration rounds ${hours}:${remainder} to ${expected.toFixed(2)}`, () => {
    assert.equal(computePayableHoursFromDuration(minutes), expected);
  });
}