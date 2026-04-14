import test from "node:test";
import assert from "node:assert/strict";
import {
  parsePayrollExportBatchActionPayload,
  parsePayrollPeriodPayload,
  parseTimesheetResolutionPayload,
} from "./adminTimesheetService.js";

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

test("parseTimesheetResolutionPayload accepts payroll status updates", () => {
  const parsed = parseTimesheetResolutionPayload({
    reviewStatus: "reviewed",
    payrollStatus: "approved",
    reviewNote: "Cleared for payroll.",
  });

  assert.equal(parsed.payrollStatus, "approved");
  assert.equal(parsed.hasOperationalChange, true);
});

test("parseTimesheetResolutionPayload rejects invalid payroll statuses", () => {
  assert.throws(
    () =>
      parseTimesheetResolutionPayload({
        reviewStatus: "reviewed",
        payrollStatus: "processing",
        reviewNote: "Invalid payroll status.",
      }),
    /payrollStatus must be one of/
  );
});

test("parseTimesheetResolutionPayload rejects manual exported transitions", () => {
  assert.throws(
    () =>
      parseTimesheetResolutionPayload({
        reviewStatus: "reviewed",
        payrollStatus: "exported",
        reviewNote: "Export should happen through a batch.",
      }),
    /payrollStatus must be one of: pending, approved/
  );
});

test("parsePayrollExportBatchActionPayload requires a reopen note", () => {
  assert.throws(
    () => parsePayrollExportBatchActionPayload({}),
    /note is required/
  );
});

test("parsePayrollExportBatchActionPayload trims and returns the note", () => {
  const parsed = parsePayrollExportBatchActionPayload({ note: "  Payroll requested corrections.  " });
  assert.equal(parsed.note, "Payroll requested corrections.");
});

test("parsePayrollPeriodPayload requires YYYY-MM-DD dates", () => {
  assert.throws(
    () => parsePayrollPeriodPayload({ startDate: "04/01/2026", endDate: "2026-04-14" }),
    /startDate must use YYYY-MM-DD format/
  );
});

test("parsePayrollPeriodPayload validates range order", () => {
  assert.throws(
    () => parsePayrollPeriodPayload({ startDate: "2026-04-15", endDate: "2026-04-01" }),
    /startDate must be on or before endDate/
  );
});

test("parsePayrollPeriodPayload derives a default label", () => {
  const parsed = parsePayrollPeriodPayload({ startDate: "2026-04-01", endDate: "2026-04-14" });
  assert.equal(parsed.label, "2026-04-01 to 2026-04-14");
});
