import express from "express";
import {
  createProject,
  getProjects,
  getProjectById,
  updateProject,
  archiveProject,
  restoreProject,
  getArchivedProjects,
  deleteProject,
} from "../controllers/projectController.js";
import { verifyUser } from "../middleware/verifyUser.js";
import {
  verifyWorkspaceMember,
  requireRole,
} from "../middleware/verifyWorkspaceAccess.js";

const router = express.Router();

router.use(verifyUser);

router.post(
  "/:workspaceId/create",
  verifyWorkspaceMember,
  requireRole(["owner", "admin"]),
  createProject
);
router.get("/:workspaceId/fetch", verifyWorkspaceMember, getProjects);
router.get("/:workspaceId/:projectId", verifyWorkspaceMember, getProjectById);
router.put(
  "/:workspaceId/:projectId/update",
  verifyWorkspaceMember,
  requireRole(["owner", "admin"]),
  updateProject
);
router.patch(
  "/:workspaceId/:projectId/archive",
  verifyWorkspaceMember,
  requireRole(["owner", "admin"]),
  archiveProject
);
router.patch(
  "/:workspaceId/:projectId/restore",
  verifyWorkspaceMember,
  requireRole(["owner", "admin"]),
  restoreProject
);
router.get(
  "/:workspaceId/archived",
  verifyWorkspaceMember,
  getArchivedProjects
);
router.delete(
  "/:workspaceId/:projectId/delete",
  verifyWorkspaceMember,
  requireRole(["owner"]),
  deleteProject
);

export default router;
