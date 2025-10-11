import express from "express";
import {
  createWorkspace,
  getWorkspaces,
  getWorkspaceById,
  updateWorkspace,
  deleteWorkspace,
  inviteMember,
  getInvitationPage,
  acceptInvitation,
  removeMember,
  updateMemberRole,
  leaveWorkspace,
  cancelInvitation,
  getWorkspaceInvitations,
} from "../controllers/workspaceController.js";
import { verifyUser } from "../middleware/verifyUser.js";
import { verifyWorkspaceMember, requireRole } from "../middleware/verifyWorkspaceAccess.js";

const router = express.Router();

router.get("/accept-invite/:token", getInvitationPage);

router.use(verifyUser);

router.post("/create", createWorkspace);
router.get("/fetch", getWorkspaces);
router.get("/fetch/:id", getWorkspaceById);
router.put("/update/:workspaceId", verifyWorkspaceMember, requireRole(["owner", "admin"]), updateWorkspace);
router.delete("/delete/:workspaceId", verifyWorkspaceMember, requireRole(["owner"]), deleteWorkspace);

router.post("/accept-invite/:token", acceptInvitation);

router.post("/invite/:workspaceId", verifyWorkspaceMember, inviteMember);
router.get("/invitations/:workspaceId", verifyWorkspaceMember, requireRole(["owner", "admin"]), getWorkspaceInvitations);
router.delete("/cancel-invitation/:workspaceId/:token", verifyWorkspaceMember, requireRole(["owner", "admin"]), cancelInvitation);
router.delete("/:workspaceId/remove-member/:userId", verifyWorkspaceMember, requireRole(["owner", "admin"]), removeMember);
router.patch("/:workspaceId/member/:userId/update-role", verifyWorkspaceMember, requireRole(["owner", "admin"]), updateMemberRole);
router.post("/:workspaceId/leave", verifyWorkspaceMember, leaveWorkspace);

export default router;