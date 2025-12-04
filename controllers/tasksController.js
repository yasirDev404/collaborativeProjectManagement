import Task from "../models/tasksModel";
import Project from "../models/projectModel";
import Workspace from "../models/workspaceModel";
import User from "../models/userModel";

import { successHelper, errorHelper } from "../utilities/helpers";

function checkUserIsOwner(x, y) {
  if (x === y) {
    console.log("User is the owner of the workspace");
    return true;
  } else {
    return errorHelper(
      res,
      null,
      "Workspace owner is not the same as the user",
      403
    );
  }
}

const createTask = async (req, res) => {
  const {
    title,
    description,
    projectId,
    workspaceId,
    status,
    priority,
    assignedTo,
    dueDate,
    estimatedHours,
    attachments,
  } = req.body;
  const { id } = req.user.id;
  if (!id) {
    return errorHelper(res, null, "Unauthorized access", 401);
  }

  if (!title || !projectId || !workspaceId || !assignedTo || !estimatedHours) {
    return errorHelper(
      res,
      null,
      "Title, ProjectId, WorkspaceId, AssignedTo, and estimatedHours are required",
      400
    );
  }

  try {
    const authorizedUser = await User.findById(id);
    const workspace = await Workspace.findById(workspaceId);
    const workspaceOwnerId = workspace.ownerId;
    const project = await Project.findById(projectId);

    const isProjectInWorkspace = project.workspaceId.toString() === workspaceId;
    if (!isProjectInWorkspace) {
      return errorHelper(
        res,
        null,
        "The project you are trying to add is not inside of the current workspace you have selected"
      );
    }
    //  const isAssignedToProjectMember = 
    checkUserIsOwner(id, workspaceOwnerId);
  } catch (e) {
    console.log(e, "eroEREOREORIER");
    return errorHelper(res, null, "Internal Server Error", 500);
  }
};
