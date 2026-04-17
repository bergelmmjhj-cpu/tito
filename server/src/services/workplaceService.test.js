import test from "node:test";
import assert from "node:assert/strict";
import {
  assertActiveWorkplaceIntegrity,
  buildDuplicateGroups,
  hasZeroCoordinates,
} from "./workplaceService.js";

test("hasZeroCoordinates identifies invalid hotel geofence coordinates", () => {
  assert.equal(hasZeroCoordinates(0, 0), true);
  assert.equal(hasZeroCoordinates(1, 0), false);
  assert.equal(hasZeroCoordinates(0, -90), false);
});

test("assertActiveWorkplaceIntegrity rejects active workplace with 0,0", () => {
  assert.throws(
    () =>
      assertActiveWorkplaceIntegrity({
        latitude: 0,
        longitude: 0,
        timeZone: "America/New_York",
      }),
    /0,0 coordinates/
  );
});

test("assertActiveWorkplaceIntegrity requires time zone", () => {
  assert.throws(
    () =>
      assertActiveWorkplaceIntegrity({
        latitude: 41.321,
        longitude: -72.111,
        timeZone: "",
      }),
    /must include a valid timeZone/
  );
});

test("buildDuplicateGroups groups hotels by normalized name and city", () => {
  const duplicates = buildDuplicateGroups([
    { id: "a", name: "Stoneridge", city: "Miami", createdAt: "2026-01-01T00:00:00.000Z", crm: {} },
    { id: "b", name: "  STONERIDGE  ", city: "miami", createdAt: "2026-01-02T00:00:00.000Z", crm: {} },
    { id: "c", name: "Different", city: "Austin", createdAt: "2026-01-01T00:00:00.000Z", crm: {} },
  ]);

  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].normalizedName, "STONERIDGE");
  assert.equal(duplicates[0].normalizedCity, "MIAMI");
  assert.deepEqual(
    duplicates[0].items.map((item) => item.id),
    ["a", "b"]
  );
});
