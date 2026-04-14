import test from "node:test";
import assert from "node:assert/strict";
import { getAuthOptions, isGoogleOAuthEnabled } from "./authService.js";

const ORIGINAL_ENV = {
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
};

function restoreGoogleEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
}

test("isGoogleOAuthEnabled returns false when Google OAuth env vars are missing", () => {
  try {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REDIRECT_URI;

    assert.equal(isGoogleOAuthEnabled("https://example.com"), false);
  } finally {
    restoreGoogleEnv();
  }
});

test("isGoogleOAuthEnabled uses request origin as redirect fallback when client credentials exist", () => {
  try {
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    delete process.env.GOOGLE_REDIRECT_URI;

    assert.equal(isGoogleOAuthEnabled("https://example.com"), true);
  } finally {
    restoreGoogleEnv();
  }
});

test("getAuthOptions exposes unified login and provider availability", () => {
  try {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REDIRECT_URI;

    assert.deepEqual(getAuthOptions("https://example.com"), {
      unifiedLogin: true,
      providers: {
        google: {
          enabled: false,
        },
      },
    });
  } finally {
    restoreGoogleEnv();
  }
});