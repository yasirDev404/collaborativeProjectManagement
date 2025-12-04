import {
  registerUser,
  resendOtp,
  verifyEmailOtp,
  loginUser,
  updateUserProfile,
  changePassword,
  deleteUser,
  getAllUsers,
  getUserById,
  getUserProfile,
} from "../controllers/userController.js";
import { Router } from "express";
import { verifyUser } from "../middleware/verifyUser.js";

const router = Router();
router.post("/register", registerUser);
router.put("/resend-otp", resendOtp);
router.post("/verify-email", verifyUser, verifyEmailOtp);
router.post("/login", loginUser);
router.get("/:id", verifyUser,getUserById)
router.get("/profile", verifyUser, getUserProfile);
router.get("/all-users", verifyUser, getAllUsers);
router.put("/update-profile", verifyUser, updateUserProfile);
router.put("/change-password", verifyUser, changePassword);
router.delete("/delete-account", verifyUser, deleteUser);

export default router;