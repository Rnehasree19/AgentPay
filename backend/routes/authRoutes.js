import express from "express";
import { currentUser, googleLogin, listAdminUsers, logout, passwordLogin, passwordSignup } from "../controllers/authController.js";
import { requireAuthentication } from "../middleware/requireAuthentication.js";

const router = express.Router();

router.post("/google", googleLogin);
router.post("/signup", passwordSignup);
router.post("/login", passwordLogin);
router.post("/logout", logout);
router.get("/me", requireAuthentication, currentUser);
router.get("/admin/users", requireAuthentication, listAdminUsers);

export default router;