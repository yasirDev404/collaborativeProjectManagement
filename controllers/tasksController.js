import mongoose from "mongoose";
import Task from "../models/tasksModel.js";
import Project from "../models/projectModel.js";
import { successHelper, errorHelper } from "../utilities/helpers.js";
import { checkWorkspaceRole, hasMinRole } from "../utilities/roleHelper.js";
import {
  taskValidationSchema,
  updateTaskSchema,
  confirmDeleteSchema,
} from "../utilities/validation.js";

const createTask = async (req, res) => {
  const { error } = taskValidationSchema.validate(req.body, {
    allowUnknown: false,
    stripUnknown: true,
  });

  if (error) {
    return errorHelper(res, error.details[0].message, "Validation Error", 400);
  }

  try {
    if (!hasMinRole(req.workspace, req.user._id, "member")) {
      return errorHelper(
        res,
        null,
        "Insufficient permissions to create tasks",
        403
      );
    }

    const { projectId } = req.params;
    const { title, description, assignedTo, priority, dueDate, labels, estimatedHours } = req.body;

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
      return errorHelper(res, null, "Cannot create tasks in archived projects", 400);
    }

    if (assignedTo && assignedTo.length > 0) {
      const workspaceMemberIds = req.workspace.members.map((m) =>
        m.userId.toString()
      );

      const invalidAssignees = assignedTo.filter(
        (userId) => !workspaceMemberIds.includes(userId)
      );

      if (invalidAssignees.length > 0) {
        return errorHelper(
          res,
          null,
          "Some assigned users are not part of this workspace",
          400
        );
      }
    }

    const lastTask = await Task.findOne({
      projectId: projectId,
      deletedAt: null,
    })
      .sort({ position: -1 })
      .select("position");

    const position = lastTask ? lastTask.position + 1 : 0;

    const task = await Task.create({
      title,
      description: description || "",
      projectId,
      workspaceId: req.workspace._id,
      status: "todo",
      priority: priority || "medium",
      assignedTo: assignedTo || [],
      createdBy: req.user._id,
      dueDate: dueDate || null,
      position,
      labels: labels || [],
      estimatedHours: estimatedHours || 0,
      checklist: [],
      attachments: [],
    });

    const populatedTask = await Task.findById(task._id)
      .populate("createdBy", "name email avatar")
      .populate("assignedTo", "name email avatar")
      .populate("projectId", "name");

    return successHelper(
      res,
      populatedTask,
      "Task created successfully",
      201
    );
  } catch (e) {
    console.error("Error creating task:", e);
    return errorHelper(res, e, "Error creating task", 500);
  }
};

const getTasks = async (req, res) => {
  try {
    const { projectId } = req.params;
    const {
      status,
      priority,
      assignedTo,
      dueDate,
      search,
      page = 1,
      limit = 50,
    } = req.query;

    if (projectId && !mongoose.Types.ObjectId.isValid(projectId)) {
      return errorHelper(res, null, "Invalid project ID", 400);
    }

    const query = {
      workspaceId: req.workspace._id,
      deletedAt: null,
    };

    if (projectId) {
      const project = await Project.findOne({
        _id: projectId,
        workspaceId: req.workspace._id,
        deletedAt: null,
      });

      if (!project) {
        return errorHelper(res, null, "Project not found", 404);
      }

      query.projectId = projectId;
    }

    if (status) {
      query.status = status;
    }

    if (priority) {
      query.priority = priority;
    }

    if (assignedTo) {
      const assigneeIds = Array.isArray(assignedTo) ? assignedTo : [assignedTo];
      query.assignedTo = { $in: assigneeIds };
    }

    if (dueDate) {
      if (dueDate === "overdue") {
        query.dueDate = { $lt: new Date() };
        query.status = { $ne: "done" };
      } else if (dueDate === "today") {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);
        query.dueDate = { $gte: startOfDay, $lte: endOfDay };
      } else if (dueDate === "upcoming") {
        query.dueDate = { $gte: new Date() };
      }
    }

    if (search) {
      query.$text = { $search: search };
    }

    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 100);

    const tasks = await Task.find(query)
      .populate("createdBy", "name email avatar")
      .populate("assignedTo", "name email avatar")
      .populate("projectId", "name color icon")
      .sort({ position: 1, createdAt: -1 })
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum);

    const count = await Task.countDocuments(query);

    return successHelper(
      res,
      {
        tasks,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: count,
          pages: Math.ceil(count / limitNum),
        },
      },
      "Tasks fetched successfully",
      200
    );
  } catch (e) {
    console.error("Error fetching tasks:", e);
    return errorHelper(res, e, "Error fetching tasks", 500);
  }
};

const getTaskById = async (req, res) => {
  try {
    const { taskId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return errorHelper(res, null, "Invalid task ID", 400);
    }

    const task = await Task.findOne({
      _id: taskId,
      workspaceId: req.workspace._id,
      deletedAt: null,
    })
      .populate("createdBy", "name email avatar")
      .populate("assignedTo", "name email avatar")
      .populate("projectId", "name description color icon")
      .populate("checklist.completedBy", "name email avatar")
      .populate("attachments.uploadedBy", "name email avatar");

    if (!task) {
      return errorHelper(res, null, "Task not found", 404);
    }

    const taskData = task.toObject();
    const completedChecklistItems = task.checklist.filter(
      (item) => item.isCompleted
    ).length;
    const totalChecklistItems = task.checklist.length;
    taskData.completionPercentage =
      totalChecklistItems > 0
        ? Math.round((completedChecklistItems / totalChecklistItems) * 100)
        : 0;

    const isOverdue =
      task.dueDate &&
      new Date(task.dueDate) < new Date() &&
      task.status !== "done";
    taskData.isOverdue = isOverdue;

    return successHelper(res, taskData, "Task fetched successfully", 200);
  } catch (e) {
    console.error("Error fetching task:", e);
    return errorHelper(res, e, "Error fetching task", 500);
  }
};

const updateTask = async (req, res) => {
  const { error } = updateTaskSchema.validate(req.body, {
    allowUnknown: false,
    stripUnknown: true,
  });

  if (error) {
    return errorHelper(res, error.details[0].message, "Validation Error", 400);
  }

  try {
    const { taskId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return errorHelper(res, null, "Invalid task ID", 400);
    }

    const task = await Task.findOne({
      _id: taskId,
      workspaceId: req.workspace._id,
      deletedAt: null,
    });

    if (!task) {
      return errorHelper(res, null, "Task not found", 404);
    }

    const isAssignee = task.assignedTo.some(
      (userId) => userId.toString() === req.user._id.toString()
    );
    const isCreator = task.createdBy.toString() === req.user._id.toString();
    const canEdit = hasMinRole(req.workspace, req.user._id, "member");

    if (!canEdit && !isAssignee && !isCreator) {
      return errorHelper(res, null, "Insufficient permissions", 403);
    }

    const {
      title,
      description,
      assignedTo,
      status,
      priority,
      dueDate,
      labels,
      estimatedHours,
      actualHours,
      position,
    } = req.body;

    const changes = {};

    if (title && title !== task.title) {
      changes.title = { from: task.title, to: title };
      task.title = title;
    }

    if (description !== undefined && description !== task.description) {
      changes.description = { from: task.description, to: description };
      task.description = description;
    }

    if (assignedTo !== undefined) {
      const workspaceMemberIds = req.workspace.members.map((m) =>
        m.userId.toString()
      );

      const invalidAssignees = assignedTo.filter(
        (userId) => !workspaceMemberIds.includes(userId)
      );

      if (invalidAssignees.length > 0) {
        return errorHelper(
          res,
          null,
          "Some assigned users are not part of this workspace",
          400
        );
      }

      const oldAssignees = task.assignedTo.map((id) => id.toString());
      const newAssignees = assignedTo;

      const addedAssignees = newAssignees.filter(
        (id) => !oldAssignees.includes(id)
      );
      const removedAssignees = oldAssignees.filter(
        (id) => !newAssignees.includes(id)
      );

      if (addedAssignees.length > 0 || removedAssignees.length > 0) {
        changes.assignedTo = {
          added: addedAssignees,
          removed: removedAssignees,
        };
        task.assignedTo = assignedTo;
      }
    }

    if (status && status !== task.status) {
      changes.status = { from: task.status, to: status };
      task.status = status;

      if (status === "done" && !task.completedAt) {
        task.completedAt = new Date();
      } else if (status !== "done" && task.completedAt) {
        task.completedAt = null;
      }
    }

    if (priority && priority !== task.priority) {
      changes.priority = { from: task.priority, to: priority };
      task.priority = priority;
    }

    if (dueDate !== undefined) {
      const oldDueDate = task.dueDate ? task.dueDate.toISOString() : null;
      const newDueDate = dueDate ? new Date(dueDate).toISOString() : null;

      if (oldDueDate !== newDueDate) {
        changes.dueDate = { from: oldDueDate, to: newDueDate };
        task.dueDate = dueDate ? new Date(dueDate) : null;
      }
    }

    if (labels !== undefined) {
      const oldLabels = [...task.labels].sort().join(",");
      const newLabels = [...labels].sort().join(",");

      if (oldLabels !== newLabels) {
        changes.labels = { from: task.labels, to: labels };
        task.labels = labels;
      }
    }

    if (estimatedHours !== undefined && estimatedHours !== task.estimatedHours) {
      changes.estimatedHours = { from: task.estimatedHours, to: estimatedHours };
      task.estimatedHours = estimatedHours;
    }

    if (actualHours !== undefined && actualHours !== task.actualHours) {
      changes.actualHours = { from: task.actualHours, to: actualHours };
      task.actualHours = actualHours;
    }

    if (position !== undefined && position !== task.position) {
      changes.position = { from: task.position, to: position };
      task.position = position;
    }

    await task.save();

    const updatedTask = await Task.findById(task._id)
      .populate("createdBy", "name email avatar")
      .populate("assignedTo", "name email avatar")
      .populate("projectId", "name");

    return successHelper(
      res,
      {
        task: updatedTask,
        changes: Object.keys(changes).length > 0 ? changes : null,
      },
      "Task updated successfully",
      200
    );
  } catch (e) {
    console.error("Error updating task:", e);
    return errorHelper(res, e, "Error updating task", 500);
  }
};

const deleteTask = async (req, res) => {
  const { error } = confirmDeleteSchema.validate(req.body);

  if (error) {
    return errorHelper(res, error.details[0].message, "Validation Error", 400);
  }

  try {
    const { taskId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return errorHelper(res, null, "Invalid task ID", 400);
    }

    const task = await Task.findOne({
      _id: taskId,
      workspaceId: req.workspace._id,
      deletedAt: null,
    });

    if (!task) {
      return errorHelper(res, null, "Task not found", 404);
    }

    const isCreator = task.createdBy.toString() === req.user._id.toString();
    const canDelete = hasMinRole(req.workspace, req.user._id, "admin");

    if (!canDelete && !isCreator) {
      return errorHelper(res, null, "Insufficient permissions to delete task", 403);
    }

    task.deletedAt = new Date();
    await task.save();

    return successHelper(
      res,
      {
        message: "Task deleted successfully",
        taskId: task._id,
      },
      "Task deleted successfully",
      200
    );
  } catch (e) {
    console.error("Error deleting task:", e);
    return errorHelper(res, e, "Error deleting task", 500);
  }
};

const updateTaskStatus = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { status } = req.body;

    if (!status || !["todo", "in_progress", "in_review", "done"].includes(status)) {
      return errorHelper(res, null, "Invalid status", 400);
    }

    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return errorHelper(res, null, "Invalid task ID", 400);
    }

    const task = await Task.findOne({
      _id: taskId,
      workspaceId: req.workspace._id,
      deletedAt: null,
    });

    if (!task) {
      return errorHelper(res, null, "Task not found", 404);
    }

    const isAssignee = task.assignedTo.some(
      (userId) => userId.toString() === req.user._id.toString()
    );
    const canEdit = hasMinRole(req.workspace, req.user._id, "member");

    if (!canEdit && !isAssignee) {
      return errorHelper(res, null, "Insufficient permissions", 403);
    }

    const oldStatus = task.status;
    task.status = status;

    if (status === "done" && !task.completedAt) {
      task.completedAt = new Date();
    } else if (status !== "done" && task.completedAt) {
      task.completedAt = null;
    }

    await task.save();

    const updatedTask = await Task.findById(task._id)
      .populate("createdBy", "name email avatar")
      .populate("assignedTo", "name email avatar")
      .populate("projectId", "name");

    return successHelper(
      res,
      {
        task: updatedTask,
        changes: { status: { from: oldStatus, to: status } },
      },
      "Task status updated successfully",
      200
    );
  } catch (e) {
    console.error("Error updating task status:", e);
    return errorHelper(res, e, "Error updating task status", 500);
  }
};

const updateChecklist = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { checklist } = req.body;

    if (!Array.isArray(checklist)) {
      return errorHelper(res, null, "Checklist must be an array", 400);
    }

    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return errorHelper(res, null, "Invalid task ID", 400);
    }

    const task = await Task.findOne({
      _id: taskId,
      workspaceId: req.workspace._id,
      deletedAt: null,
    });

    if (!task) {
      return errorHelper(res, null, "Task not found", 404);
    }

    const isAssignee = task.assignedTo.some(
      (userId) => userId.toString() === req.user._id.toString()
    );
    const canEdit = hasMinRole(req.workspace, req.user._id, "member");

    if (!canEdit && !isAssignee) {
      return errorHelper(res, null, "Insufficient permissions", 403);
    }

    const updatedChecklist = checklist.map((item) => {
      if (item._id) {
        const existingItem = task.checklist.id(item._id);
        if (existingItem) {
          if (item.isCompleted !== undefined) {
            existingItem.isCompleted = item.isCompleted;
            if (item.isCompleted && !existingItem.completedAt) {
              existingItem.completedAt = new Date();
              existingItem.completedBy = req.user._id;
            } else if (!item.isCompleted) {
              existingItem.completedAt = null;
              existingItem.completedBy = null;
            }
          }
          if (item.text !== undefined) {
            existingItem.text = item.text;
          }
          return existingItem;
        }
      }
      return {
        text: item.text,
        isCompleted: item.isCompleted || false,
      };
    });

    task.checklist = updatedChecklist;
    await task.save();

    const updatedTask = await Task.findById(task._id)
      .populate("createdBy", "name email avatar")
      .populate("assignedTo", "name email avatar")
      .populate("checklist.completedBy", "name email avatar");

    return successHelper(
      res,
      updatedTask,
      "Checklist updated successfully",
      200
    );
  } catch (e) {
    console.error("Error updating checklist:", e);
    return errorHelper(res, e, "Error updating checklist", 500);
  }
};

export {
  createTask,
  getTasks,
  getTaskById,
  updateTask,
  deleteTask,
  updateTaskStatus,
  updateChecklist,
};