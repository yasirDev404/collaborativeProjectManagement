import User from "../models/userModel.js";
import { userValidationSchema } from "../utilities/validation.js";
import {
  successHelper,
  errorHelper,
  generateToken,
  generateOtp,
  hashOtp,
  hashPassword,
  signToken,
} from "../utilities/helpers.js";
import sendEmail from "../utilities/email.js";

const registerUser = async (req, res) => {
  const { error } = userValidationSchema.validate(req.body);
  if (error) {
    return errorHelper(res, error.details[0].message, "Validation Error", 400);
  }

  const { email, name, password, city, postalCode, country, state } = req.body;
  if (!email) {
    return errorHelper(res, null, "Email is required", 400);
  }
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return errorHelper(res, null, "User already exists", 400);
  }

  try {
    const otp = generateOtp();
    const hashedOtp = hashOtp(otp);
    const hashedPassword = await hashPassword(password);

    sendEmail(
      email,
      "Welcome to Dexa Doors - CPM, Verify Your Email",
      `Your OTP is ${otp}. It is valid for 10 minutes.`
    ).catch((err) => {
      console.error("Error sending email:", err);
    });

   const newUser = await User.create({
      email,
      name,
      city,
      postalCode,
      country,
      state,
      password: hashedPassword,
      otp: hashedOtp,
      otpExpire: Date.now() + 10 * 60 * 1000,
      isEmailVerified: false,
    });

   const token = signToken({ id: newUser._id, email });

    return successHelper(
      res,
      token,
      "User created Successfully,An email has been sent to your email to verify your account, please enter the OTP to continue using CPM!",
      201
    );
  } catch (e) {
    console.log("Error:", e);
    return errorHelper(res, e, "Error creating user", 500);
  }
};

const resendOtp = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return errorHelper(res, null, "Email is required", 400);
  }
  try {
    const existingUser = await User.findOne({ email });
    if (!existingUser) {
      return errorHelper(res, null, "User does not exist", 400);
    }
    const otp = generateOtp();
    const hashedOtp = hashOtp(otp);

    sendEmail(
      email,
      "Welcome to Dexa Doors - CPM, Verify Your Email",
      `Your OTP is ${otp}. It is valid for 10 minutes.`
    ).catch((err) => {
      console.error("Error sending email:", err);
    });

    await User.findOneAndUpdate(
      { email },
      { otp: hashedOtp, otpExpire: Date.now() + 10 * 60 * 1000 }
    );
    const token = signToken({ id: existingUser._id, email });
    return successHelper(
      res,
      token,
      "OTP resent Successfully, Please verify your email to login",
      200
    );
  } catch (e) {
    console.log("Error:", e);
    return errorHelper(res, e, "Error resending OTP", 500);
  }
};

const verifyEmailOtp = async (req, res) => {
  const { otp } = req.body;
  const id = req.user._id;
  
  if (!otp) {
    return errorHelper(res, null, "OTP is required", 400);
  }
  
  try {
    const existingUser = await User.findById(id);
    if (!existingUser) {
      return errorHelper(res, null, "User not found", 404);
    }
    
    // Debug logs
    console.log("Incoming OTP:", otp);
    console.log("OTP Type:", typeof otp);
    console.log("Stored OTP:", existingUser.otp);
    console.log("OTP Expiry:", new Date(existingUser.otpExpire));
    console.log("Current Time:", new Date(Date.now()));
    console.log("Is Expired?", existingUser.otpExpire < Date.now());
    
    const hashedOtp = hashOtp(otp);
    console.log("Hashed incoming OTP:", hashedOtp);
    console.log("OTPs match?", existingUser.otp === hashedOtp);
    
    if (existingUser.otp !== hashedOtp || existingUser.otpExpire < Date.now()) {
      return errorHelper(res, null, "Invalid or expired OTP", 400);
    }

    existingUser.isEmailVerified = true;
    existingUser.otp = undefined;
    existingUser.otpExpire = undefined;
    await existingUser.save();

    const token = generateToken(existingUser);
    return successHelper(res, { token }, "Email verified successfully", 200);
  } catch (e) {
    console.log("Error:", e);
    return errorHelper(res, e, "Error verifying OTP", 500);
  }
};

export { registerUser, resendOtp, verifyEmailOtp };
