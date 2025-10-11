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
  expireAt: Date, // * TTL field - unverified users will be deleted after 30 minutes
});

// * TTL index - MongoDB will automatically delete documents when expireAt date is reached
userSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

// * Pre-save hook to manage the expireAt field for TTL functionality
userSchema.pre("save", function (next) {
  // * Set expireAt to 30 minutes from now for NEW unverified users only
  if (this.isNew && !this.isEmailVerified && !this.expireAt) {
    this.expireAt = new Date(Date.now() + 30 * 60 * 1000);
  }
  
  // * CRITICAL: Remove expireAt field when user gets verified to prevent deletion
  // * Setting to undefined removes the field from MongoDB entirely
  if (this.isEmailVerified && this.expireAt) {
    this.expireAt = undefined;
  }
  
  next();
});

const User = mongoose.model("User", userSchema, "app_users");

export default User;