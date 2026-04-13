import { verifyGoogleToken, getGoogleAuthUrl } from "../services/googleAuthService.js";
import { findUserByGoogleId, linkGoogleIdToUser, createUserFromGoogle } from "../models/googleAuthModel.js";
import { findUserByEmail } from "../models/userModel.js";
import { createSession } from "../services/sessionService.js";
import { toHttpError } from "../utils/errors.js";

function sanitizeUser(user) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    name: user.name,
    email: user.email,
    phone: user.phone || null,
    staffId: user.staffId,
    role: user.role,
    isActive: user.isActive !== false,
    assignedWorkplaceId: user.profile?.assignedWorkplaceId || null,
  };
}

export async function googleAuthUrlController(req, res) {
  try {
    const url = getGoogleAuthUrl();
    res.json({ url });
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export async function googleCallbackController(req, res) {
  try {
    const { idToken } = req.body || {};

    if (!idToken) {
      return res.status(400).json({ error: "idToken is required" });
    }

    // Verify the Google ID token
    const googleProfile = await verifyGoogleToken(idToken);

    // Check if a user already exists with this Google ID
    let user = await findUserByGoogleId(googleProfile.id);

    if (user) {
      // Existing Google-linked user — create session and return
      if (user.isActive === false) {
        return res.status(403).json({ error: "User account is inactive" });
      }

      const token = await createSession(user.id);
      return res.json({ token, user: sanitizeUser(user) });
    }

    // No user found by Google ID — check if email already exists
    const existingUser = await findUserByEmail(googleProfile.email);

    if (existingUser) {
      // Link Google ID to the existing account
      if (existingUser.isActive === false) {
        return res.status(403).json({ error: "User account is inactive" });
      }

      user = await linkGoogleIdToUser(existingUser.id, googleProfile.id, googleProfile.email);
      const token = await createSession(user.id);
      return res.json({ token, user: sanitizeUser(user) });
    }

    // No existing user — create a new account from Google profile
    user = await createUserFromGoogle(googleProfile);

    if (!user) {
      return res.status(500).json({ error: "Failed to create user account" });
    }

    const token = await createSession(user.id);
    return res.json({ token, user: sanitizeUser(user) });
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}
