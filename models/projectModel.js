import mongoose from "mongoose";

const projectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      minlength: 3,
      maxlength: 200,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    color: {
      type: String,
      default: "#3B82F6", // Default blue color
      match: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, // Validate hex color
    },
    icon: {
      type: String,
      default: "📁", // Default folder emoji
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
projectSchema.index({ workspaceId: 1, isArchived: 1 });
projectSchema.index({ workspaceId: 1, deletedAt: 1 });
projectSchema.index({ workspaceId: 1, createdAt: -1 });

// Virtual for task count (will be populated via aggregation)
projectSchema.virtual("taskCount", {
  ref: "Task",
  localField: "_id",
  foreignField: "projectId",
  count: true,
});

projectSchema.pre("save", function (next) {
  if (this.isModified("isArchived")) {
    if (this.isArchived && !this.archivedAt) {
      this.archivedAt = new Date();
    } else if (!this.isArchived) {
      this.archivedAt = null;
    }
  }
  next();
});

projectSchema.methods.isMember = function (userId) {
  return this.members.some((memberId) => memberId.toString() === userId.toString());
};

const Project = mongoose.model("Project", projectSchema);

export default Project;