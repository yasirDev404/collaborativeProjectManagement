import { registerUser } from "../controllers/userController.js";
import { Router } from "express";
const router = Router();

router.post("/register", registerUser);

export default router;