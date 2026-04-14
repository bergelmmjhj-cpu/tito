import test from "node:test";
import assert from "node:assert/strict";
import {
  formatBusinessDate,
  getDefaultBusinessTimeZone,
  isValidTimeZone,
  resolveBusinessTimeZone,
} from "./time.js";

const ORIGINAL_ENV = {
  BUSINESS_DEFAULT_TIME_ZONE: process.env.BUSINESS_DEFAULT_TIME_ZONE,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
}

test("isValidTimeZone accepts valid IANA zones and rejects invalid values", () => {
  assert.equal(isValidTimeZone("America/New_York"), true);
  assert.equal(isValidTimeZone("Invalid/Timezone"), false);
  assert.equal(isValidTimeZone("   "), false);
});

test("resolveBusinessTimeZone trims valid input and falls back to configured default", () => {
  try {
    process.env.BUSINESS_DEFAULT_TIME_ZONE = "America/Chicago";

    assert.equal(resolveBusinessTimeZone(" America/New_York "), "America/New_York");
    assert.equal(resolveBusinessTimeZone("Invalid/Timezone"), "America/Chicago");
    assert.equal(getDefaultBusinessTimeZone(), "America/Chicago");
  } finally {
    restoreEnv();
  }
});

test("formatBusinessDate uses the hotel business time zone when deriving dates", () => {
  assert.equal(formatBusinessDate("2026-01-01T04:30:00.000Z", "UTC"), "2026-01-01");
  assert.equal(formatBusinessDate("2026-01-01T04:30:00.000Z", "America/New_York"), "2025-12-31");
  assert.equal(formatBusinessDate("not-a-date", "America/New_York"), null);
});
