import { SessionService } from "../services/auth/sessionService.js";
import { getSessionToken } from "../services/auth/sessionCookie.js";

const sessionService = new SessionService();

export async function optionalAuthentication(req, res, next) {
  try {
    const user = await sessionService.validateSession(getSessionToken(req));
    if (user) {
      req.user = user;
    }
  } catch {
    // Anonymous product discovery remains available when session storage is unavailable.
  }

  next();
}

export default optionalAuthentication;