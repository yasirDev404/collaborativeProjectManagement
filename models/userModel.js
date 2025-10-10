import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String },
    email: { type: String, required: true, unique: true },
    password: { type: String, select: false },
    confirmPassword: { type: String, select: false },
    avatar: { type: String, default: "" },
    role: { type: String, default: "user" },
    isEmailVerified: { type: Boolean, default: false },
    otp: { type: String },
    otpExpire: { type: Date },
    country: { type: String },
    state: { type: String },
    city: { type: String },
    postalCode: { type: String },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

export default User;
