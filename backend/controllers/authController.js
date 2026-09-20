import { verifyGoogleToken } from "../services/auth/googleAuthService.js";
import { validateGoogleLoginBody } from "../validators/authValidator.js";
import { AuthenticationError } from "../errors/AuthenticationError.js";
import { userRepository } from "../repositories/userRepository.js";
import { SessionService } from "../services/auth/sessionService.js";
import { UserPolicyService } from "../services/auth/UserPolicyService.js";
import { clearSessionCookie, getSessionToken, setSessionCookie } from "../services/auth/sessionCookie.js";
import { requireAuthentication } from "../middleware/requireAuthentication.js";
import { validatePasswordAuthBody } from "../validators/authValidator.js";
import { hashPassword, verifyPassword } from "../services/auth/passwordService.js";
import { ConflictError } from "../errors/ConflictError.js";
import { AuthorizationError } from "../errors/AuthorizationError.js";

const sessionService = new SessionService();
const userPolicyService = new UserPolicyService();

function safeUser(user) {
  return {
    id: String(user._id || user.id),
    name: user.name,
    email: user.email,
    role: user.role,
    picture: user.picture || "",
  };
}

const ADMIN_EMAIL = "adminneha@gmail.com";

export function createGoogleLoginHandler({
  verifyToken = verifyGoogleToken,
  users = userRepository,
  policies = userPolicyService,
  sessions = sessionService,
} = {}) {
  return async function googleLogin(req, res, next) {
    try {
    validateGoogleLoginBody(req.body);

    const payload = await verifyToken(req.body.credential);

    if (!payload?.email || !payload?.email_verified || !payload?.sub) {
      throw new AuthenticationError("Google account could not be verified.");
    }

    const email = payload.email.toLowerCase();

    if (email === ADMIN_EMAIL) {
      throw new AuthenticationError(
        "Admin account must use email and password login."
      );
    }

    let user = await users.findByProvider("google", payload.sub);

    if (!user) {
      user = await users.findByEmail(email);
    }

    if (user) {
      user = await users.updateById(user._id, {
        name: payload.name || user.name || email.split("@")[0],
        picture: payload.picture || user.picture || "",
        authProvider: "google",
        providerId: payload.sub,
      });
    } else {
      user = await users.create({
        name: payload.name || email.split("@")[0],
        email,
        authProvider: "google",
        providerId: payload.sub,
        role: "user",
        picture: payload.picture || "",
      });
    }

    await policies.ensureDefaultUserPolicy(user._id);

    const session = await sessions.createSession(user._id);
    setSessionCookie(res, session.token);

    return res.json({
      success: true,
      user: safeUser(user),
    });
    } catch (error) {
      next(error);
    }
  };
}

export const googleLogin = createGoogleLoginHandler();

export function createPasswordAuthHandlers({ users = userRepository, policies = userPolicyService, sessions = sessionService } = {}) {
  async function login(req, res, next) {
    try {
      const { email, password } = validatePasswordAuthBody(req.body);
      const user = await users.findLocalByEmail(email);
      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        throw new AuthenticationError("Invalid email or password.");
      }
      await policies.ensureDefaultUserPolicy(user._id);
      const session = await sessions.createSession(user._id);
      setSessionCookie(res, session.token);
      return res.json({ success: true, user: safeUser(user) });
    } catch (error) {
      return next(error);
    }
  }

  async function signup(req, res, next) {
    try {
      const { name, email, password } = validatePasswordAuthBody(req.body, { requireName: true });
      if (await users.findByEmail(email)) throw new ConflictError("An account with that email already exists.");
      const user = await users.create({ name, email, passwordHash: await hashPassword(password), authProvider: "local", role: "user" });
      await policies.ensureDefaultUserPolicy(user._id);
      const session = await sessions.createSession(user._id);
      setSessionCookie(res, session.token);
      return res.status(201).json({ success: true, user: safeUser(user) });
    } catch (error) {
      if (error?.code === 11000) return next(new ConflictError("An account with that email already exists."));
      return next(error);
    }
  }

  return { login, signup };
}

const passwordAuthHandlers = createPasswordAuthHandlers();
export const passwordLogin = passwordAuthHandlers.login;
export const passwordSignup = passwordAuthHandlers.signup;

export async function logout(req, res, next) {
  try {
    await sessionService.deleteSession(getSessionToken(req));
    clearSessionCookie(res);
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
}

export function currentUser(req, res) {
  return res.json({ user: safeUser(req.user) });
}

export async function listAdminUsers(req, res, next) {
  try {
    if (req.user.role !== "admin") {
      throw new AuthorizationError("Admin access is required for this request.");
    }

    const users = await userRepository.listUsers();
    return res.json({
      users: users.map((user) => ({
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      })),
    });
  } catch (error) {
    return next(error);
  }
}

export { requireAuthentication };