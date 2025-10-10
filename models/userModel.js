import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  city: String,
  postalCode: String,
  country: String,
  state: String,
  otp: String,
  otpExpire: Date,
  isEmailVerified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }, 
});

// 🟢 Only delete *unverified* users after 30 minutes
userSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 1800, // 30 minutes
    partialFilterExpression: { isEmailVerified: false },
  }
);

const User = mongoose.model("User", userSchema);

export default User;