import {
  registerUser,
  resendOtp,
  verifyEmailOtp,
} from "../controllers/userController.js";
import { Router } from "express";
import { verifyUser } from "../middleware/verifyUser.js";

const router = Router();

router.post("/register", registerUser);
router.put("/resend-otp", resendOtp);
router.post("/verify-email", verifyUser, verifyEmailOtp);

export default router;
