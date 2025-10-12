import mongoose from "mongoose";
import Project from "../models/projectModel.js";
import {
  projectValidationSchema,
  updateProjectSchema,
  confirmDeleteSchema,
} from "../utilities/validation.js";
import { successHelper, errorHelper } from "../utilities/helpers.js";
import { checkWorkspaceRole } from "../utilities/roleHelper.js";

const createProject = async (req, res) => {
  const { error } = projectValidationSchema.validate(req.body, {
    allowUnknown: false,
    stripUnknown: true,
  });

  if (error) {
    return errorHelper(res, error.details[0].message, "Validation Error", 400);
  }

  try {
    if (!checkWorkspaceRole(req.workspace, req.user._id, ["owner", "admin"])) {
      return errorHelper(
        res,
        null,
        "Insufficient permissions to create projects",
        403
      );
    }

    const { name, description, color, icon, members } = req.body;

    // Validate that all members are workspace members
    if (members && members.length > 0) {
      const workspaceMemberIds = req.workspace.members.map((m) =>
        m.userId.toString()
      );

      const invalidMembers = members.filter(
        (memberId) => !workspaceMemberIds.includes(memberId)
      );

      if (invalidMembers.length > 0) {
        return errorHelper(
          res,
          null,
          "Some members are not part of this workspace",
          400
        );
      }
    }

    const project = await Project.create({
      name,
      description,
      color: color || "#3B82F6",
      icon: icon || "📁",
      workspaceId: req.workspace._id,
      members: members || [],
      createdBy: req.user._id,
    });

    const populatedProject = await Project.findById(project._id)
      .populate("createdBy", "name email avatar")
      .populate("members", "name email avatar");

    // TODO: Create activity log
    // TODO: Send notifications to project members
    // TODO: Emit WebSocket event

    return successHelper(
      res,
      populatedProject,
      "Project created successfully",
      201
    );
  } catch (e) {
    console.error("Error creating project:", e);
    return errorHelper(res, e, "Error creating project", 500);
  }
};

const getProjects = async (req, res) => {
  try {
    const { includeArchived = "false", page = 1, limit = 50 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 100);

    const query = {
      workspaceId: req.workspace._id,
      deletedAt: null,
    };

    if (includeArchived === "false") {
      query.isArchived = false;
    }

    const projects = await Project.find(query)
      .populate("createdBy", "name email avatar")
      .populate("members", "name email avatar")
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum);

    const count = await Project.countDocuments(query);

    // Aggregate task statistics for each project
    const projectIds = projects.map((p) => p._id);

    // TODO: When Task model is created, add task statistics aggregation here
    // For now, return projects without task stats
    const projectsWithStats = projects.map((project) => ({
      ...project.toObject(),
      memberCount: project.members.length,
      taskStats: {
        total: 0,
        completed: 0,
        inProgress: 0,
        overdue: 0,
      },
    }));

    return successHelper(
      res,
      {
        projects: projectsWithStats,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: count,
          pages: Math.ceil(count / limitNum),
        },
      },
      "Projects fetched successfully",
      200
    );
  } catch (e) {
    console.error("Error fetching projects:", e);
    return errorHelper(res, e, "Error fetching projects", 500);
  }
};

const getProjectById = async (req, res) => {
  try {
    const { projectId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return errorHelper(res, null, "Invalid project ID", 400);
    }

    const project = await Project.findOne({
      _id: projectId,
      workspaceId: req.workspace._id,
      deletedAt: null,
    })
      .populate("createdBy", "name email avatar")
      .populate("members", "name email avatar");

    if (!project) {
      return errorHelper(res, null, "Project not found", 404);
    }

    const projectData = {
      ...project.toObject(),
      memberCount: project.members.length,
      taskStats: {
        total: 0,
        completed: 0,
        inProgress: 0,
        overdue: 0,
      },
    };

    return successHelper(res, projectData, "Project fetched successfully", 200);
  } catch (e) {
    console.error("Error fetching project:", e);
    return errorHelper(res, e, "Error fetching project", 500);
  }
};

const updateProject = async (req, res) => {
  const { error } = updateProjectSchema.validate(req.body, {
    allowUnknown: false,
    stripUnknown: true,
  });

  if (error) {
    return errorHelper(res, error.details[0].message, "Validation Error", 400);
  }

  try {
    if (!checkWorkspaceRole(req.workspace, req.user._id, ["owner", "admin"])) {
      return errorHelper(res, null, "Insufficient permissions", 403);
    }

    const { projectId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return errorHelper(res, null, "Invalid project ID", 400);
    }

    const project = await Project.findOne({
      _id: projectId,
      workspaceId: req.workspace._id,
      deletedAt: null,
    });

    if (!project) {
      return errorHelper(res, null, "Project not found", 404);
    }

    const { name, description, color, icon, members } = req.body;

    // Track changes for activity log
    const changes = {};

    if (name && name !== project.name) {
      changes.name = { from: project.name, to: name };
      project.name = name;
    }

    if (description !== undefined && description !== project.description) {
      changes.description = { from: project.description, to: description };
      project.description = description;
    }

    if (color && color !== project.color) {
      changes.color = { from: project.color, to: color };
      project.color = color;
    }

    if (icon && icon !== project.icon) {
      changes.icon = { from: project.icon, to: icon };
      project.icon = icon;
    }

    if (members !== undefined) {
      // Validate that all members are workspace members
      const workspaceMemberIds = req.workspace.members.map((m) =>
        m.userId.toString()
      );

      const invalidMembers = members.filter(
        (memberId) => !workspaceMemberIds.includes(memberId)
      );

      if (invalidMembers.length > 0) {
        return errorHelper(
          res,
          null,
          "Some members are not part of this workspace",
          400
        );
      }

      const oldMembers = project.members.map((m) => m.toString());
      const newMembers = members;

      const addedMembers = newMembers.filter((m) => !oldMembers.includes(m));
      const removedMembers = oldMembers.filter((m) => !newMembers.includes(m));

      if (addedMembers.length > 0 || removedMembers.length > 0) {
        changes.members = {
          added: addedMembers,
          removed: removedMembers,
        };
        project.members = members;
      }

      // TODO: Send notifications to newly added members
    }

    await project.save();

    const updatedProject = await Project.findById(project._id)
      .populate("createdBy", "name email avatar")
      .populate("members", "name email avatar");

    // TODO: Create activity log with changes
    // TODO: Emit WebSocket event

    return successHelper(
      res,
      {
        project: updatedProject,
        changes: Object.keys(changes).length > 0 ? changes : null,
      },
      "Project updated successfully",
      200
    );
  } catch (e) {
    console.error("Error updating project:", e);
    return errorHelper(res, e, "Error updating project", 500);
  }
};

const archiveProject = async (req, res) => {
  try {
    if (!checkWorkspaceRole(req.workspace, req.user._id, ["owner", "admin"])) {
      return errorHelper(res, null, "Insufficient permissions", 403);
    }

    const { projectId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return errorHelper(res, null, "Invalid project ID", 400);
    }

    const project = await Project.findOne({
      _id: projectId,
      workspaceId: req.workspace._id,
      deletedAt: null,
    });

    if (!project) {
      return errorHelper(res, null, "Project not found", 404);
    }

    if (project.isArchived) {
      return errorHelper(res, null, "Project is already archived", 400);
    }

    project.isArchived = true;
    project.archivedAt = new Date();
    await project.save();

    const archivedProject = await Project.findById(project._id)
      .populate("createdBy", "name email avatar")
      .populate("members", "name email avatar");

    // TODO: Create activity log
    // TODO: Send notifications to project members
    // TODO: Emit WebSocket event

    return successHelper(
      res,
      archivedProject,
      "Project archived successfully",
      200
    );
  } catch (e) {
    console.error("Error archiving project:", e);
    return errorHelper(res, e, "Error archiving project", 500);
  }
};

const restoreProject = async (req, res) => {
  try {
    if (!checkWorkspaceRole(req.workspace, req.user._id, ["owner", "admin"])) {
      return errorHelper(res, null, "Insufficient permissions", 403);
    }

    const { projectId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return errorHelper(res, null, "Invalid project ID", 400);
    }

    const project = await Project.find({
      workspaceId: req.workspace._id,
      isArchived: true,
      deletedAt: null,
    });

    if (!project) {
      return errorHelper(res, null, "Project not found", 404);
    }

    if (!project.isArchived) {
      return errorHelper(res, null, "Project is not archived", 400);
    }

    project.isArchived = false;
    project.archivedAt = null;
    await project.save();

    const restoredProject = await Project.findById(project._id)
      .populate("createdBy", "name email avatar")
      .populate("members", "name email avatar");

    // TODO: Create activity log
    // TODO: Emit WebSocket event

    return successHelper(
      res,
      restoredProject,
      "Project restored successfully",
      200
    );
  } catch (e) {
    console.error("Error restoring project:", e);
    return errorHelper(res, e, "Error restoring project", 500);
  }
};

const getArchivedProjects = async (req, res) => {
  try {
    if (
      !checkWorkspaceRole(req.workspace, req.user._id, [
        "owner",
        "admin",
        "member",
      ])
    ) {
      return errorHelper(res, null, "Insufficient permissions", 403);
    }
    const { projectId } = req.params;

    const archivedProjects = await Project.find({
      _id: projectId,
      workspaceId: req.workspace._id,
      isArchived: true,
      deletedAt: null,
    })
      .populate("createdBy", "name email avatar")
      .populate("members", "name email avatar");

    if (!archivedProjects) {
      return errorHelper(res, null, "No archived projects found", 404);
    }

    return successHelper(
      res,
      archivedProjects,
      "Archived projects fetched successfully",
      200
    );
  } catch (e) {
    console.error("Error fetching archived projects:", e);
    return errorHelper(res, e, "Error fetching archived projects", 500);
  }
};

// DELETE PROJECT (Soft Delete)
const deleteProject = async (req, res) => {
  const { error } = confirmDeleteSchema.validate(req.body);

  if (error) {
    return errorHelper(res, error.details[0].message, "Validation Error", 400);
  }

  try {
    if (req.workspace.ownerId.toString() !== req.user._id.toString()) {
      return errorHelper(
        res,
        null,
        "Only workspace owner can delete projects",
        403
      );
    }

    const { projectId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return errorHelper(res, null, "Invalid project ID", 400);
    }

    const project = await Project.findOneAndDelete({
      _id: projectId,
      workspaceId: req.workspace._id,
      deletedAt: null,
    });

    if (!project) {
      return errorHelper(res, null, "Project not found", 404);
    }

    // TODO: Count and soft delete all tasks in this project
    // TODO: Create activity log
    // TODO: Emit WebSocket event
    // TODO: Queue job to hard delete after 30 days

    return successHelper(
      res,
      {
        message: "Project deleted successfully",
        projectId: project._id,
        deletedTasksCount: 0, // Will be updated when Task model is created
      },
      "Project deleted successfully",
      200
    );
  } catch (e) {
    console.error("Error deleting project:", e);
    return errorHelper(res, e, "Error deleting project", 500);
  }
};

export {
  createProject,
  getProjects,
  getProjectById,
  updateProject,
  archiveProject,
  restoreProject,
  getArchivedProjects,
  deleteProject,
};
