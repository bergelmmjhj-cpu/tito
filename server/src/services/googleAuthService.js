import { OAuth2Client } from "google-auth-library";

let client = null;

export function initializeGoogleAuth() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID environment variable is not set");
  }

  client = new OAuth2Client(clientId, clientSecret, redirectUri);
  console.log("[google-auth] OAuth2Client initialized");
  return client;
}

function getClient() {
  if (!client) {
    throw new Error("Google Auth has not been initialized. Call initializeGoogleAuth() first.");
  }
  return client;
}

export async function verifyGoogleToken(idToken) {
  if (!idToken || typeof idToken !== "string") {
    throw new Error("ID token is required");
  }

  const oauthClient = getClient();

  let ticket;
  try {
    ticket = await oauthClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
  } catch (error) {
    console.error("[google-auth] Token verification failed:", error.message);
    throw new Error("Invalid or expired Google ID token");
  }

  const payload = ticket.getPayload();

  if (!payload) {
    throw new Error("Google token payload is empty");
  }

  if (!payload.email_verified) {
    throw new Error("Google account email is not verified");
  }

  return {
    id: payload.sub,
    email: payload.email,
    name: payload.name || "",
    picture: payload.picture || null,
    email_verified: payload.email_verified,
  };
}

export function getGoogleAuthUrl() {
  const oauthClient = getClient();

  const scopes = [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "openid",
  ];

  return oauthClient.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "select_account",
  });
}
