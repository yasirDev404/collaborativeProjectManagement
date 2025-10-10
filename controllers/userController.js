import User from "../models/userModel.js";
import { userValidationSchema } from "../utilities/validation.js";
import {
  successHelper,
  errorHelper,
  generateToken,
  generateOtp,
  hashOtp,
  hashPassword,
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

    await User.create({
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

    return successHelper(
      res,
      null,
      "User created Successfully, Please verify your email to login",
      201
    );
  } catch (e) {
    console.log("Error:", e);
    return errorHelper(res, e, "Error creating user", 500);
  }
};

export { registerUser };
