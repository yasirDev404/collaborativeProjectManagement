import jwt from "jsonwebtoken";
import User from "../models/userModel.js";
import { errorHelper } from "../utilities/helpers.js";

export const verifyUser = async (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return errorHelper(res, null, "Unauthorized: No token provided", 401);
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const foundUser = await User.findById(decoded.id)
      .select("-password")

    if (!foundUser) {
      return errorHelper(res, null, "Unauthorized: user not found", 401);
    }

    req.user = foundUser;
    next();
  } catch (error) {
    return errorHelper(res, null, "Unauthorized: Invalid token", 401);
  }
};