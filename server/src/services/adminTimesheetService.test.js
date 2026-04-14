import test from "node:test";
import assert from "node:assert/strict";
import { parseTimesheetResolutionPayload } from "./adminTimesheetService.js";

test("parseTimesheetResolutionPayload requires at least one actionable change", () => {
  assert.throws(
    () => parseTimesheetResolutionPayload({ reviewNote: "Checked by manager" }),
    /At least one resolution change is required/
  );
});

test("parseTimesheetResolutionPayload requires a manager note", () => {
  assert.throws(
    () =>
      parseTimesheetResolutionPayload({
        reviewStatus: "reviewed",
      }),
    /reviewNote is required/
  );
});

test("parseTimesheetResolutionPayload normalizes timestamps and payable hours", () => {
  const parsed = parseTimesheetResolutionPayload({
    reviewStatus: "follow_up_required",
    reviewNote: "Needs payroll follow-up.",
    closeOpenShiftAt: "2026-04-14T18:30:00.000Z",
    payableHours: "7.5",
  });

  assert.equal(parsed.reviewStatus, "follow_up_required");
  assert.equal(parsed.reviewNote, "Needs payroll follow-up.");
  assert.equal(parsed.closeOpenShiftAt, "2026-04-14T18:30:00.000Z");
  assert.equal(parsed.payableHours, 7.5);
  assert.equal(parsed.hasOperationalChange, true);
});
