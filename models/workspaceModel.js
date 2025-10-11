import mongoose from "mongoose";

const workspaceSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true, 
    minlength: 3, 
    maxlength: 100,
    trim: true 
  },
  description: { type: String, trim: true },
  ownerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  members: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { 
      type: String, 
      enum: ['owner', 'admin', 'member', 'viewer'],
      default: 'member'
    },
    joinedAt: { type: Date, default: Date.now }
  }],
  invitations: [{
    email: { type: String, required: true },
    token: { type: String, required: true, unique: true },
    role: { 
      type: String, 
      enum: ['member', 'admin'],
      default: 'member'
    },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { 
      type: Date, 
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }
  }],
  settings: {
    allowMemberInvites: { type: Boolean, default: false },
    defaultProjectVisibility: { type: String, default: 'team' }
  },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

workspaceSchema.index({ 'members.userId': 1 });
workspaceSchema.index({ ownerId: 1 });
workspaceSchema.index({ 'invitations.token': 1 });

const Workspace = mongoose.model("Workspace", workspaceSchema);
export default Workspace;