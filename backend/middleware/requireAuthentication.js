import { AuthenticationError } from "../errors/AuthenticationError.js";
import { SessionService } from "../services/auth/sessionService.js";
import { getSessionToken } from "../services/auth/sessionCookie.js";

const sessionService = new SessionService();

export function createRequireAuthentication(service = sessionService) {
  return async function requireAuthentication(req, res, next) {
    try {
      const user = await service.validateSession(getSessionToken(req));

      if (!user) {
        return next(new AuthenticationError("Authentication is required for this request."));
      }

      req.user = user;
      return next();
    } catch (error) {
      return next(new AuthenticationError("Authentication could not be verified."));
    }
  };
}

export const requireAuthentication = createRequireAuthentication();
export default requireAuthentication;