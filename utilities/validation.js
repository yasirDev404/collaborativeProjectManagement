import Joi from "joi";

export const userValidationSchema = Joi.object({
  name: Joi.string().required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  avatar: Joi.string(),
  role: Joi.string(),
  isEmailVerified: Joi.boolean(),
  otp: Joi.string(),
  otpExpire: Joi.date(),
  country: Joi.string(),
  state: Joi.string(),
  city: Joi.string(),
  postalCode: Joi.string(),
});

export const loginValidationSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

export const resendOtpSchema = Joi.object({
  email: Joi.string().email().required(),
});

export const verifyOtpSchema = Joi.object({
  otp: Joi.alternatives().try(Joi.string().trim(), Joi.number()).required(),
});

export const updateUserProfileSchema = Joi.object({
  name: Joi.string().required(),
  avatar: Joi.string(),
  country: Joi.string(),
  state: Joi.string(),
  city: Joi.string(),
  postalCode: Joi.string(),
});

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().min(6).required(),
  newPassword: Joi.string().min(6).required(),
});
