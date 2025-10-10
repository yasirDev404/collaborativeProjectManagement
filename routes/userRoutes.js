import {
  registerUser,
  resendOtp,
  verifyEmailOtp,
  loginUser,
  updateUserProfile,
} from "../controllers/userController.js";
import { Router } from "express";
import { verifyUser } from "../middleware/verifyUser.js";

const router = Router();

router.post("/register", registerUser);
router.put("/resend-otp", resendOtp);
router.post("/verify-email", verifyUser, verifyEmailOtp); //temporary token used here
router.post("/login", loginUser);
router.put("/update-profile", verifyUser, updateUserProfile);

export default router;
