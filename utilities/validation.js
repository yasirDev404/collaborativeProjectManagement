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
