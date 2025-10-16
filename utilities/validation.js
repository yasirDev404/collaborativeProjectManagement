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


export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().min(6).required(),
  newPassword: Joi.string().min(6).required(),
});

export const updateUserProfileSchema = Joi.object({
  name: Joi.string().required(),
  avatar: Joi.string(),
  country: Joi.string(),
  state: Joi.string(),
  city: Joi.string(),
  postalCode: Joi.string(),
});
export const workspaceValidationSchema = Joi.object({
  name: Joi.string().min(3).max(100).required(),
  description: Joi.string().allow('').optional()
});

export const updateWorkspaceSchema = Joi.object({
  name: Joi.string().min(3).max(100).trim(),
  description: Joi.string().allow('').trim(),
  settings: Joi.object({
    allowMemberInvites: Joi.boolean(),
    defaultProjectVisibility: Joi.string().valid('team', 'private', 'public')
  })
}).min(1); 

export const inviteMemberSchema = Joi.object({
  email: Joi.string().email().required(),
  role: Joi.string().valid('member', 'admin').default('member')
});

export const updateMemberRoleSchema = Joi.object({
  role: Joi.string().valid('owner', 'admin', 'member', 'viewer').required()
});

export const projectValidationSchema = Joi.object({
  name: Joi.string().min(3).max(200).required(),
  description: Joi.string().allow('').optional(),
  color: Joi.string().pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/).optional(),
  icon: Joi.string().max(10).optional(),
  members: Joi.array().items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/)).optional()
});

export const updateProjectSchema = Joi.object({
  name: Joi.string().min(3).max(200),
  description: Joi.string().allow(''),
  color: Joi.string().pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/),
  icon: Joi.string().max(10),
  members: Joi.array().items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/))
}).min(1);

export const confirmDeleteSchema = Joi.object({
  confirmDelete: Joi.boolean().valid(true).required()
});