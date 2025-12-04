import express from "express";
import {
  createTask,
  getTasks,
  getTaskById,
  updateTask,
  deleteTask,
  updateTaskStatus,
  updateChecklist,
} from "../controllers/tasksController.js";
import { verifyUser } from "../middleware/verifyUser.js";
import {
  verifyWorkspaceMember,
  requireRole,
} from "../middleware/verifyWorkspaceAccess.js";

const router = express.Router();

router.use(verifyUser);

router.post(
  "/:workspaceId/:projectId/create",
  verifyWorkspaceMember,
  createTask
);

router.get("/:workspaceId/fetch", verifyWorkspaceMember, getTasks);

router.get("/:workspaceId/:projectId/fetch", verifyWorkspaceMember, getTasks);

router.get("/:workspaceId/:taskId", verifyWorkspaceMember, getTaskById);

router.put(
  "/:workspaceId/:taskId/update",
  verifyWorkspaceMember,
  updateTask
);

router.patch(
  "/:workspaceId/:taskId/status",
  verifyWorkspaceMember,
  updateTaskStatus
);

router.put(
  "/:workspaceId/:taskId/checklist",
  verifyWorkspaceMember,
  updateChecklist
);

router.delete(
  "/:workspaceId/:taskId/delete",
  verifyWorkspaceMember,
  deleteTask
);

export default router;
