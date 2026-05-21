import test from "node:test";
import assert from "node:assert/strict";
import { buildAuthCompleteHtml } from "./authController.js";

test("buildAuthCompleteHtml redirects Google sign-in to worker app when role=worker", () => {
  const html = buildAuthCompleteHtml({ token: "worker-token", role: "worker" });
  assert.match(html, /window\.location\.replace\(nextPath\)/);
  assert.match(html, /role === "worker" \? "\/worker\/"/);
});

test("buildAuthCompleteHtml redirects Google sign-in to admin app when role=admin", () => {
  const html = buildAuthCompleteHtml({ token: "admin-token", role: "admin" });
  assert.match(html, /role === "admin" \? "\/admin\/"/);
});

test("buildAuthCompleteHtml preserves auth error redirect behavior", () => {
  const html = buildAuthCompleteHtml({ error: "Google login failed" });
  assert.match(html, /target\.searchParams\.set\("authError", error\)/);
});
