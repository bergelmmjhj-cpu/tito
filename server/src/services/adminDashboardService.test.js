import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyOpenShiftAgeHours,
  getDashboardThresholds,
} from "./adminDashboardService.js";

test("dashboard uses default threshold values", () => {
  const thresholds = getDashboardThresholds();
  assert.equal(thresholds.openShiftThresholdHours, 8);
  assert.equal(thresholds.autoClockOutHours, 14);
});

test("open vs missing split classifies ages around threshold", () => {
  assert.equal(classifyOpenShiftAgeHours(5, 8), "open");
  assert.equal(classifyOpenShiftAgeHours(8, 8), "missing_clock_out");
  assert.equal(classifyOpenShiftAgeHours(9, 8), "missing_clock_out");
});
