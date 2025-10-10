import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const successHelper = (res, data, message, status = 200) => {
  res.status(status).json({
    data,
    status: "success",
    message,
  });
};

const hashPassword = async (password) => {
  return await bcrypt.hash(password, 10);
};

const errorHelper = (res, error, message, status = 400) => {
  console.error("Error:", error);
  res.status(status).json({
    error,
    status: "error",
    message: message || "Something went wrong",
  });
};

const generateToken = (user) => {
  return jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: "45d",
  });
};

const signToken = (data) => {
  return jwt.sign(data, process.env.JWT_SECRET, {
    expiresIn: "30m",
  });
};

const generateOtp = () => {
 return Math.floor(1000 + Math.random() * 9000).toString();
};

const hashOtp = (otp) => {
  return crypto.createHash("sha256").update(otp).digest("hex");
};

export {
  successHelper,
  errorHelper,
  generateToken,
  hashPassword,
  signToken,
  generateOtp,
  hashOtp,
};
