import Workspace from "../models/workspaceModel.js";
import {
  workspaceValidationSchema,
  updateWorkspaceSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
} from "../utilities/validation.js";
import { successHelper, errorHelper } from "../utilities/helpers.js";
import { checkWorkspaceRole, getUserRole } from "../utilities/roleHelper.js";
import crypto from "crypto";
import sendEmail from "../utilities/email.js";

// Constants
const INVITATION_VALIDITY_DAYS = 7;
const INVITATION_RATE_LIMIT_MS = 60 * 1000; // 60 seconds

const createWorkspace = async (req, res) => {
  const { error } = workspaceValidationSchema.validate(req.body);
  if (error) {
    return errorHelper(res, error.details[0].message, "Validation Error", 400);
  }

  try {
    const workspace = await Workspace.create({
      name: req.body.name,
      description: req.body.description,
      ownerId: req.user._id,
      members: [
        {
          userId: req.user._id,
          role: "owner",
          joinedAt: new Date(),
        },
      ],
    });

    const populated = await workspace.populate(
      "members.userId",
      "name email avatar"
    );
    return successHelper(res, populated, "Workspace created successfully", 201);
  } catch (e) {
    console.error("Error creating workspace:", e);
    return errorHelper(res, e, "Error creating workspace", 500);
  }
};

const getWorkspaces = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const workspaces = await Workspace.find({
      "members.userId": req.user._id,
      deletedAt: null,
    })
      .populate("ownerId", "name email avatar")
      .sort({ updatedAt: -1 })
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum);

    const count = await Workspace.countDocuments({
      "members.userId": req.user._id,
      deletedAt: null,
    });

    const workspacesWithRole = workspaces.map((ws) => ({
      ...ws.toObject(),
      role: getUserRole(ws, req.user._id),
      memberCount: ws.members.length,
    }));

    return successHelper(
      res,
      {
        workspaces: workspacesWithRole,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: count,
          pages: Math.ceil(count / limitNum),
        },
      },
      "Workspaces fetched successfully",
      200
    );
  } catch (e) {
    console.error("Error fetching workspaces:", e);
    return errorHelper(res, e, "Error fetching workspaces", 500);
  }
};

const getWorkspaceById = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id)
      .populate("members.userId", "name email avatar")
      .populate("ownerId", "name email avatar");

    if (!workspace || workspace.deletedAt) {
      return errorHelper(res, null, "Workspace not found", 404);
    }

    const isMember = workspace.members.some(
      (m) => m.userId._id.toString() === req.user._id.toString()
    );

    if (!isMember) {
      return errorHelper(res, null, "Access denied", 403);
    }

    const workspaceData = {
      ...workspace.toObject(),
      userRole: getUserRole(workspace, req.user._id),
    };

    return successHelper(
      res,
      workspaceData,
      "Workspace fetched successfully",
      200
    );
  } catch (e) {
    console.error("Error fetching workspace:", e);
    return errorHelper(res, e, "Error fetching workspace", 500);
  }
};

const updateWorkspace = async (req, res) => {
  const { error } = updateWorkspaceSchema.validate(req.body, {
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

    const { name, description, settings } = req.body;

    if (name) req.workspace.name = name;
    if (description !== undefined) req.workspace.description = description;
    if (settings) {
      req.workspace.settings = { ...req.workspace.settings, ...settings };
    }

    await req.workspace.save();

    const populated = await req.workspace.populate(
      "members.userId",
      "name email avatar"
    );

    return successHelper(res, populated, "Workspace updated successfully", 200);
  } catch (e) {
    console.error("Error updating workspace:", e);
    return errorHelper(res, e, "Error updating workspace", 500);
  }
};

const deleteWorkspace = async (req, res) => {
  const workspaceId = req.params.workspaceId;
  const deletWorkspace = await Workspace.findByIdAndDelete(workspaceId);
  if (!deletWorkspace) {
    return errorHelper(res, null, "Workspace not found", 404);
  }
  try {
    if (req.workspace.ownerId.toString() !== req.user._id.toString()) {
      return errorHelper(res, null, "Only owner can delete workspace", 403);
    }

    return successHelper(res, null, "Workspace deleted successfully", 200);
  } catch (e) {
    console.error("Error deleting workspace:", e);
    return errorHelper(res, e, "Error deleting workspace", 500);
  }
};

const inviteMember = async (req, res) => {
  const { error } = inviteMemberSchema.validate(req.body);
  if (error) {
    return errorHelper(res, error.details[0].message, "Validation Error", 400);
  }

  try {
    const canInvite =
      checkWorkspaceRole(req.workspace, req.user._id, ["owner", "admin"]) ||
      (req.workspace.settings.allowMemberInvites &&
        checkWorkspaceRole(req.workspace, req.user._id, ["member"]));

    if (!canInvite) {
      return errorHelper(res, null, "No permission to invite members", 403);
    }

    const { email, role } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    if (normalizedEmail === req.user.email.toLowerCase()) {
      return errorHelper(res, null, "You cannot invite yourself", 400);
    }

    // Populate members to check email
    await req.workspace.populate("members.userId", "email");

    const existingMember = req.workspace.members.find(
      (m) => m.userId.email.toLowerCase() === normalizedEmail
    );
    if (existingMember) {
      return errorHelper(res, null, "User is already a member", 400);
    }

    // Check for existing active invitation
    const existingInvite = req.workspace.invitations.find(
      (i) =>
        i.email.toLowerCase() === normalizedEmail && i.expiresAt > new Date()
    );

    if (existingInvite) {
      const timeSinceCreated = Date.now() - existingInvite.createdAt.getTime();

      if (timeSinceCreated < INVITATION_RATE_LIMIT_MS) {
        const remainingSeconds = Math.ceil(
          (INVITATION_RATE_LIMIT_MS - timeSinceCreated) / 1000
        );
        return errorHelper(
          res,
          null,
          `Please wait ${remainingSeconds} seconds before resending invitation`,
          429
        );
      }

      // Remove old invitation
      req.workspace.invitations = req.workspace.invitations.filter(
        (i) =>
          !(
            i.email.toLowerCase() === normalizedEmail &&
            i.expiresAt > new Date()
          )
      );
    }

    const token = crypto.randomBytes(32).toString("hex");

    req.workspace.invitations.push({
      email: normalizedEmail,
      token,
      role: role || "member",
      invitedBy: req.user._id,
    });

    await req.workspace.save();

    // Frontend invite link - user clicks this
    const inviteLink = `${
      process.env.FRONTEND_URL || "http://localhost:3000"
    }/accept-invite/${token}`;
    // API endpoint for manual acceptance
    const apiEndpoint = `${
      process.env.BACKEND_URL || "http://localhost:3000"
    }/api/workspaces/accept-invite/${token}`;

    sendEmail(
      normalizedEmail,
      `Invitation to join ${req.workspace.name}`,
      `You've been invited to join ${req.workspace.name} as a ${
        role || "member"
      }.

Click the link below to accept the invitation:
${inviteLink}

This invitation expires in ${INVITATION_VALIDITY_DAYS} days.

---
For developers: API endpoint: ${apiEndpoint}`
    ).catch((err) => console.error("Error sending invite email:", err));

    const newInvitation =
      req.workspace.invitations[req.workspace.invitations.length - 1];

    return successHelper(
      res,
      {
        email: normalizedEmail,
        role: role || "member",
        token,
        expiresAt: newInvitation.expiresAt,
        inviteLink,
      },
      "Invitation sent successfully",
      201
    );
  } catch (e) {
    console.error("Error sending invitation:", e);
    return errorHelper(res, e, "Error sending invitation", 500);
  }
};

// GET endpoint - Shows invitation page (for when user clicks email link without being logged in)
const getInvitationPage = async (req, res) => {
  try {
    const { token } = req.params;

    const workspace = await Workspace.findOne({
      "invitations.token": token,
    }).populate("ownerId", "name");

    if (!workspace) {
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Invalid Invitation</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; 
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 20px;
            }
            .container { 
              background: white;
              border-radius: 12px;
              padding: 40px;
              max-width: 500px;
              width: 100%;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
              text-align: center;
            }
            .emoji { font-size: 64px; margin-bottom: 20px; }
            h1 { color: #e74c3c; margin-bottom: 15px; }
            p { color: #666; line-height: 1.6; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="emoji">❌</div>
            <h1>Invalid Invitation</h1>
            <p>This invitation link is invalid or has been used already.</p>
          </div>
        </body>
        </html>
      `);
    }

    const invitation = workspace.invitations.find((i) => i.token === token);

    if (!invitation || invitation.expiresAt < new Date()) {
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Expired Invitation</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; 
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 20px;
            }
            .container { 
              background: white;
              border-radius: 12px;
              padding: 40px;
              max-width: 500px;
              width: 100%;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
              text-align: center;
            }
            .emoji { font-size: 64px; margin-bottom: 20px; }
            h1 { color: #f39c12; margin-bottom: 15px; }
            p { color: #666; line-height: 1.6; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="emoji">⏰</div>
            <h1>Invitation Expired</h1>
            <p>This invitation has expired. Please contact the workspace owner for a new invitation.</p>
          </div>
        </body>
        </html>
      `);
    }

    // Valid invitation - show login/accept page
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Accept Workspace Invitation</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }
          .container { 
            background: white;
            border-radius: 12px;
            padding: 40px;
            max-width: 600px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          }
          h1 { 
            color: #333; 
            margin-bottom: 10px;
            font-size: 28px;
          }
          .subtitle {
            color: #666;
            margin-bottom: 30px;
            font-size: 16px;
          }
          .workspace-info {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid #667eea;
          }
          .workspace-info h3 {
            color: #333;
            margin-bottom: 10px;
          }
          .workspace-info p {
            color: #666;
            margin: 5px 0;
          }
          .button {
            display: inline-block;
            background: #667eea;
            color: white;
            padding: 15px 30px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 600;
            margin-top: 20px;
            transition: background 0.3s;
            cursor: pointer;
            border: none;
            font-size: 16px;
          }
          .button:hover {
            background: #5568d3;
          }
          .login-section {
            margin-top: 30px;
            padding-top: 30px;
            border-top: 1px solid #ddd;
          }
          .login-form {
            margin-top: 20px;
          }
          .form-group {
            margin-bottom: 15px;
          }
          .form-group label {
            display: block;
            margin-bottom: 5px;
            color: #333;
            font-weight: 500;
          }
          .form-group input {
            width: 100%;
            padding: 12px;
            border: 1px solid #ddd;
            border-radius: 6px;
            font-size: 14px;
          }
          .form-group input:focus {
            outline: none;
            border-color: #667eea;
          }
          .message {
            padding: 15px;
            border-radius: 6px;
            margin-top: 15px;
            display: none;
          }
          .message.success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
          }
          .message.error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
          }
          .emoji {
            font-size: 48px;
            margin-bottom: 20px;
          }
          @media (max-width: 600px) {
            .container { padding: 25px; }
            h1 { font-size: 24px; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="emoji">🎉</div>
          <h1>Workspace Invitation</h1>
          <p class="subtitle">You've been invited to join a workspace!</p>
          
          <div class="workspace-info">
            <h3>📋 Workspace Details</h3>
            <p><strong>Workspace:</strong> ${workspace.name}</p>
            <p><strong>Role:</strong> ${invitation.role}</p>
            <p><strong>Invited to:</strong> ${invitation.email}</p>
          </div>

          <div class="login-section">
            <h3>🔐 Login to Accept</h3>
            <p style="color: #666; margin-top: 10px;">Enter your credentials to accept this invitation</p>
            
            <form class="login-form" id="loginForm">
              <div class="form-group">
                <label>Email</label>
                <input type="email" id="email" value="${
                  invitation.email
                }" required>
              </div>
              <div class="form-group">
                <label>Password</label>
                <input type="password" id="password" required>
              </div>
              <button type="submit" class="button">Login & Accept Invitation</button>
            </form>

            <div class="message" id="message"></div>
          </div>
        </div>

        <script>
          const API_URL = '${
            process.env.BACKEND_URL || "http://localhost:3000"
          }';
          const token = '${token}';

          document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const messageEl = document.getElementById('message');

            try {
              // Step 1: Login
              messageEl.style.display = 'block';
              messageEl.className = 'message';
              messageEl.textContent = '🔄 Logging in...';

              const loginRes = await fetch(\`\${API_URL}/api/user/login\`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
              });

              const loginData = await loginRes.json();

              if (!loginRes.ok) {
                throw new Error(loginData.message || 'Login failed');
              }

              // Step 2: Accept invitation
              messageEl.textContent = '🔄 Accepting invitation...';

              const acceptRes = await fetch(\`\${API_URL}/api/workspaces/accept-invite/\${token}\`, {
                method: 'POST',
                headers: {
                  'Authorization': \`Bearer \${loginData.data.token}\`,
                  'Content-Type': 'application/json'
                }
              });

              const acceptData = await acceptRes.json();

              if (!acceptRes.ok) {
                throw new Error(acceptData.message || 'Failed to accept invitation');
              }

              // Success!
              messageEl.className = 'message success';
              messageEl.innerHTML = '✅ <strong>Success!</strong> You\'ve joined the workspace! Redirecting...';

              // Redirect after 2 seconds
              setTimeout(() => {
                window.location.href = '${
                  process.env.FRONTEND_URL || "http://localhost:3000"
                }/workspaces';
              }, 2000);

            } catch (error) {
              messageEl.className = 'message error';
              messageEl.innerHTML = \`❌ <strong>Error:</strong> \${error.message}\`;
            }
          });
        </script>
      </body>
      </html>
    `);
  } catch (e) {
    console.error("Error displaying invitation page:", e);
    return res.status(500).send("Error loading invitation page");
  }
};

// POST endpoint - Accepts the invitation (called after user is authenticated)
const acceptInvitation = async (req, res) => {
  try {
    const { token } = req.params;

    const workspace = await Workspace.findOne({
      "invitations.token": token,
    });

    if (!workspace) {
      return errorHelper(res, null, "Invalid invitation", 404);
    }

    const invitation = workspace.invitations.find((i) => i.token === token);

    if (!invitation || invitation.expiresAt < new Date()) {
      return errorHelper(res, null, "Invitation expired or invalid", 400);
    }

    const inviteEmail = invitation.email.toLowerCase().trim();
    const userEmail = req.user.email.toLowerCase().trim();

    if (inviteEmail !== userEmail) {
      return errorHelper(
        res,
        null,
        "This invitation was sent to a different email address",
        403
      );
    }

    const alreadyMember = workspace.members.some(
      (m) => m.userId.toString() === req.user._id.toString()
    );

    if (alreadyMember) {
      return errorHelper(
        res,
        null,
        "You are already a member of this workspace",
        400
      );
    }

    workspace.members.push({
      userId: req.user._id,
      role: invitation.role,
      joinedAt: new Date(),
    });

    workspace.invitations = workspace.invitations.filter(
      (i) => i.token !== token
    );

    await workspace.save();

    const populated = await workspace.populate(
      "members.userId",
      "name email avatar"
    );

    return successHelper(
      res,
      {
        workspace: populated.toObject(),
        role: invitation.role,
      },
      "Invitation accepted successfully",
      200
    );
  } catch (e) {
    console.error("Error accepting invitation:", e);
    return errorHelper(res, e, "Error accepting invitation", 500);
  }
};

const removeMember = async (req, res) => {
  try {
    if (!checkWorkspaceRole(req.workspace, req.user._id, ["owner", "admin"])) {
      return errorHelper(res, null, "Insufficient permissions", 403);
    }

    const { userId } = req.params;

    const targetMember = req.workspace.members.find(
      (m) => m.userId.toString() === userId
    );

    if (!targetMember) {
      return errorHelper(res, null, "Member not found", 404);
    }

    if (targetMember.role === "owner") {
      return errorHelper(res, null, "Cannot remove workspace owner", 400);
    }

    const isOwner =
      req.workspace.ownerId.toString() === req.user._id.toString();
    if (targetMember.role === "admin" && !isOwner) {
      return errorHelper(res, null, "Only owner can remove admins", 403);
    }

    req.workspace.members = req.workspace.members.filter(
      (m) => m.userId.toString() !== userId
    );

    await req.workspace.save();

    return successHelper(res, null, "Member removed successfully", 200);
  } catch (e) {
    console.error("Error removing member:", e);
    return errorHelper(res, e, "Error removing member", 500);
  }
};

const updateMemberRole = async (req, res) => {
  const { error } = updateMemberRoleSchema.validate(req.body);
  if (error) {
    return errorHelper(res, error.details[0].message, "Validation Error", 400);
  }

  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (
      role === "owner" &&
      req.workspace.ownerId.toString() !== req.user._id.toString()
    ) {
      return errorHelper(
        res,
        null,
        "Only current owner can transfer ownership",
        403
      );
    }

    if (!checkWorkspaceRole(req.workspace, req.user._id, ["owner", "admin"])) {
      return errorHelper(res, null, "Insufficient permissions", 403);
    }

    const member = req.workspace.members.find(
      (m) => m.userId.toString() === userId
    );

    if (!member) {
      return errorHelper(res, null, "Member not found", 404);
    }

    if (userId === req.user._id.toString() && role !== "owner") {
      return errorHelper(res, null, "Cannot change your own role", 400);
    }

    const oldRole = member.role;
    member.role = role;

    if (role === "owner") {
      req.workspace.ownerId = userId;
      const currentOwner = req.workspace.members.find(
        (m) => m.userId.toString() === req.user._id.toString()
      );
      if (currentOwner) currentOwner.role = "admin";
    }

    await req.workspace.save();

    const populated = await req.workspace.populate(
      "members.userId",
      "name email avatar"
    );

    return successHelper(
      res,
      {
        member: member,
        oldRole,
        newRole: role,
        workspace: populated.toObject(),
      },
      "Member role updated successfully",
      200
    );
  } catch (e) {
    console.error("Error updating member role:", e);
    return errorHelper(res, e, "Error updating member role", 500);
  }
};

const leaveWorkspace = async (req, res) => {
  try {
    const workspace = req.workspace;

    if (workspace.ownerId.toString() === req.user._id.toString()) {
      return errorHelper(
        res,
        null,
        "Owner must transfer ownership before leaving workspace",
        400
      );
    }

    const memberExists = workspace.members.some(
      (m) => m.userId.toString() === req.user._id.toString()
    );

    if (!memberExists) {
      return errorHelper(
        res,
        null,
        "You are not a member of this workspace",
        400
      );
    }

    workspace.members = workspace.members.filter(
      (m) => m.userId.toString() !== req.user._id.toString()
    );

    await workspace.save();

    return successHelper(res, null, "Left workspace successfully", 200);
  } catch (e) {
    console.error("Error leaving workspace:", e);
    return errorHelper(res, e, "Error leaving workspace", 500);
  }
};

const cancelInvitation = async (req, res) => {
  try {
    if (!checkWorkspaceRole(req.workspace, req.user._id, ["owner", "admin"])) {
      return errorHelper(res, null, "Insufficient permissions", 403);
    }

    const { token } = req.params;

    const invitation = req.workspace.invitations.find((i) => i.token === token);

    if (!invitation) {
      return errorHelper(res, null, "Invitation not found", 404);
    }

    req.workspace.invitations = req.workspace.invitations.filter(
      (i) => i.token !== token
    );

    await req.workspace.save();

    return successHelper(res, null, "Invitation cancelled successfully", 200);
  } catch (e) {
    console.error("Error cancelling invitation:", e);
    return errorHelper(res, e, "Error cancelling invitation", 500);
  }
};

const getWorkspaceInvitations = async (req, res) => {
  try {
    if (!checkWorkspaceRole(req.workspace, req.user._id, ["owner", "admin"])) {
      return errorHelper(res, null, "Insufficient permissions", 403);
    }

    await req.workspace.populate("invitations.invitedBy", "name email");

    const activeInvitations = req.workspace.invitations.filter(
      (i) => i.expiresAt > new Date()
    );

    return successHelper(
      res,
      { invitations: activeInvitations },
      "Invitations fetched successfully",
      200
    );
  } catch (e) {
    console.error("Error fetching invitations:", e);
    return errorHelper(res, e, "Error fetching invitations", 500);
  }
};

export {
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
};
