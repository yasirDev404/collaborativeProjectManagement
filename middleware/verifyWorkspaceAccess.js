import Workspace from "../models/workspaceModel.js";
import { errorHelper } from "../utilities/helpers.js";
import { checkWorkspaceRole } from "../utilities/roleHelper.js";

export const verifyWorkspaceMember = async (req, res, next) => {
  try {
    const workspace = await Workspace.findById(req.params.workspaceId);
    
    if (!workspace || workspace.deletedAt) {
      return errorHelper(res, null, "Workspace not found", 404);
    }
    
    const isMember = workspace.members.some(m => 
      m.userId.toString() === req.user._id.toString()
    );
    
    if (!isMember) {
      return errorHelper(res, null, "Access denied to workspace", 403);
    }
    
    req.workspace = workspace;
    next();
  } catch (error) {
    return errorHelper(res, error, "Error verifying workspace access", 500);
  }
};

export const requireRole = (roles) => {
  return (req, res, next) => {
    if (!checkWorkspaceRole(req.workspace, req.user._id, roles)) {
      return errorHelper(res, null, "Insufficient permissions", 403);
    }
    next();
  };
};