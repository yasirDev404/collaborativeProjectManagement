import User from "../models/userModel.js";
import {
  userValidationSchema,
  loginValidationSchema,
  resendOtpSchema,
  verifyOtpSchema,
  updateUserProfileSchema,
} from "../utilities/validation.js";
import {
  successHelper,
  errorHelper,
  generateToken,
  generateOtp,
  hashOtp,
  hashPassword,
  signToken,
  comparePassword,
} from "../utilities/helpers.js";
import sendEmail from "../utilities/email.js";


const registerUser = async (req, res) => {
  const { error } = userValidationSchema.validate(req.body, {
    allowUnknown: false,
    stripUnknown: true,
  });

  if (error) {
    return errorHelper(res, error.details[0].message, "Validation Error", 400);
  }

  const { email, name, password, city, postalCode, country, state } = req.body;

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

    // * expireAt will be automatically set by the pre-save hook in the User model
    // * New unverified users will expire after 30 minutes
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
      expireAt: new Date(Date.now() + 30 * 60 * 1000),
      role: "user",
    });

    console.log("Created user with OTP:", {
      id: newUser._id,
      email: newUser.email,
      hasOtp: !!newUser.otp,
      otpExpire: newUser.otpExpire,
      // * Log expireAt to verify TTL is working
      expireAt: newUser.expireAt,
    });

    const token = signToken({ id: newUser._id, email });

    return successHelper(
      res,
      { token },
      "User created Successfully, An email has been sent to your email to verify your account, please enter the OTP to continue using CPM!",
      201
    );
  } catch (e) {
    console.log("Error:", e);
    return errorHelper(res, e, "Error creating user", 500);
  }
};

const resendOtp = async (req, res) => {
  const { error } = resendOtpSchema.validate(req.body, {
    allowUnknown: false,
    stripUnknown: true,
  });
  if (error) {
    return errorHelper(res, error.details[0].message, "Validation Error", 400);
  }
  const { email } = req.body;

  try {
    const existingUser = await User.findOne({ email });
    if (!existingUser) {
      return errorHelper(res, null, "User does not exist", 400);
    }

    if (existingUser.isEmailVerified) {
      return errorHelper(res, null, "Email is already verified", 400);
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

    // * Reset the expireAt timer when resending OTP (another 30 minutes)
    const updatedUser = await User.findByIdAndUpdate(
      existingUser._id,
      {
        otp: hashedOtp,
        otpExpire: Date.now() + 10 * 60 * 1000,
        expireAt: new Date(Date.now() + 30 * 60 * 1000), // * Give user another 30 minutes to verify
      },
      { new: true }
    );

    console.log("Updated user OTP:", {
      id: updatedUser._id,
      hasOtp: !!updatedUser.otp,
      otpExpire: updatedUser.otpExpire,
      // * Log expireAt to verify TTL reset
      expireAt: updatedUser.expireAt,
    });

    const token = signToken({ id: existingUser._id, email });
    return successHelper(
      res,
      { token },
      "OTP resent Successfully, Please verify your email to login",
      200
    );
  } catch (e) {
    console.log("Error:", e);
    return errorHelper(res, e, "Error resending OTP", 500);
  }
};

const verifyEmailOtp = async (req, res) => {
  const { error } = verifyOtpSchema.validate(req.body, {
    allowUnknown: false,
    stripUnknown: true,
  });
  if (error) {
    return errorHelper(res, error.details[0].message, "Validation Error", 400);
  }
  const { otp } = req.body;

  try {
    const existingUser = req.user;

    console.log("Verifying OTP for user:", {
      id: existingUser._id,
      email: existingUser.email,
      hasStoredOtp: !!existingUser.otp,
      otpExpire: existingUser.otpExpire,
      currentTime: Date.now(),
      isExpired: existingUser.otpExpire < Date.now(),
    });

    const otpString = String(otp).trim();
    const hashedOtp = hashOtp(otpString);

    console.log("OTP Comparison:", {
      incoming: hashedOtp,
      stored: existingUser.otp,
      match: existingUser.otp === hashedOtp,
    });

    if (!existingUser.otp || !existingUser.otpExpire) {
      return errorHelper(
        res,
        null,
        "No OTP found. Please request a new OTP.",
        400
      );
    }

    if (existingUser.otpExpire < Date.now()) {
      return errorHelper(
        res,
        null,
        "OTP has expired. Please request a new one.",
        400
      );
    }

    if (existingUser.otp !== hashedOtp) {
      return errorHelper(res, null, "Invalid OTP", 400);
    }

    // * Mark email as verified and clean up OTP fields
    existingUser.isEmailVerified = true;
    existingUser.otp = undefined;
    existingUser.otpExpire = undefined;
    existingUser.expireAt = undefined;
    await existingUser.save();

    const token = generateToken(existingUser);

    return successHelper(res, { token }, "Email verified successfully", 200);
  } catch (e) {
    console.log("Error:", e);
    return errorHelper(res, e, "Error verifying OTP", 500);
  }
};

const loginUser = async (req, res) => {
  const { error } = loginValidationSchema.validate(req.body, {
    allowUnknown: false,
    stripUnknown: true,
  });
  if (error) {
    return errorHelper(res, error.details[0].message, "Validation Error", 400);
  }
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return errorHelper(res, null, "Invalid email or password", 401);
    }

    if (!user.isEmailVerified) {
      return errorHelper(
        res,
        null,
        "Please verify your email before logging in",
        403
      );
    }

    const isPasswordValid = await comparePassword(password, user.password);

    if (!isPasswordValid) {
      return errorHelper(res, null, "Invalid email or password", 401);
    }

    const token = generateToken(user);

    return successHelper(res, { token }, "Login successful", 200);
  } catch (e) {
    console.log("Error:", e);
    return errorHelper(res, e, "Error logging in", 500);
  }
};

const updateUserProfile = async (req, res) => {
  const { error } = updateUserProfileSchema.validate(req.body, {
    allowUnknown: false,
    stripUnknown: true,
  });
  if (error) {
    return errorHelper(res, error.details[0].message, "Validation Error", 400);
  }
  const { name, avatar, country, state, city, postalCode } = req.body;
  
  try {
    const user = req.user;

    user.name = name || user.name;
    user.avatar = avatar || user.avatar;
    user.country = country || user.country;
    user.state = state || user.state;
    user.city = city || user.city;
    user.postalCode = postalCode || user.postalCode;
    await user.save();

    return successHelper(res, user, "Profile updated successfully", 200);
  } catch (e) {
    console.log("Error:", e);
    return errorHelper(res, e, "Error updating profile", 500);
  }
};


const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password -otp -otpExpire");
    
    if (!user) {
      return errorHelper(res, null, "User not found", 404);
    }

    return successHelper(res, user, "User profile fetched successfully", 200);
  } catch (e) {
    console.log("Error:", e);
    return errorHelper(res, e, "Error fetching user profile", 500);
  }
};



// READ - Get All Users (Admin Only - Add role check as needed)
const getAllUsers = async (req, res) => {
  try {
    // Uncomment if you implement role-based access
    // if (req.user.role !== 'admin') {
    //   return errorHelper(res, null, "Unauthorized: Admin access required", 403);
    // }

    const { page = 1, limit = 10, search = "" } = req.query;
    
    const query = search
      ? {
          $or: [
            { name: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    const users = await User.find(query)
      .select("-password -otp -otpExpire")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const count = await User.countDocuments(query);

    return successHelper(
      res,
      {
        users,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
        totalUsers: count,
      },
      "Users fetched successfully",
      200
    );
  } catch (e) {
    console.log("Error:", e);
    return errorHelper(res, e, "Error fetching users", 500);
  }
};

const getUserById = async(req,res)=> {
  const id = req.params;
  if(!id){
    return errorHelper(res,null,"Id is required to find a User");
  }
  try{
     const user = await User.findById(id);
     if(!user){
      console.log(user, "USERUSERUSERUSER");
      return errorHelper(res,null,"User not found", 404);
     }
     if(user){
      return successHelper(res, user, "User fetched successfully", 200);
     }
  }catch(e){
    console.log(e, "ERROR SERVER INTERNAL ERROR");
    return errorHelper(res, e, "Error fetching user by ID", 500);
  }
}

// DELETE - Delete User Account (Self or Admin)
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Allow users to delete their own account or implement admin check
    if (req.user._id.toString() !== id) {
      return errorHelper(res, null, "Unauthorized", 403);
    }

    const user = await User.findById(id);
    
    if (!user) {
      return errorHelper(res, null, "User not found", 404);
    }

    await User.findByIdAndDelete(id);

    return successHelper(res, null, "User deleted successfully", 200);
  } catch (e) {
    console.log("Error:", e);
    return errorHelper(res, e, "Error deleting user", 500);
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return errorHelper(res, null, "Current password and new password are required", 400);
    }

    if (newPassword.length < 6) {
      return errorHelper(res, null, "New password must be at least 6 characters", 400);
    }

    const user = await User.findById(req.user._id);
    
    if (!user) {
      return errorHelper(res, null, "User not found", 404);
    }

    const isPasswordValid = await comparePassword(currentPassword, user.password);
    
    if (!isPasswordValid) {
      return errorHelper(res, null, "Current password is incorrect", 401);
    }

    user.password = await hashPassword(newPassword);
    await user.save();

    return successHelper(res, null, "Password changed successfully", 200);
  } catch (e) {
    console.log("Error:", e);
    return errorHelper(res, e, "Error changing password", 500);
  }
};

export {
  registerUser,
  resendOtp,
  verifyEmailOtp,
  loginUser,
  
  getUserProfile,
  getUserById,
  getAllUsers,
  updateUserProfile,
  deleteUser,
  changePassword,
};