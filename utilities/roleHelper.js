export const checkWorkspaceRole = (workspace, userId, requiredRoles) => {
  const member = workspace.members.find(m => 
    m.userId.toString() === userId.toString()
  );
  return member && requiredRoles.includes(member.role);
};

export const hasMinRole = (workspace, userId, minRole) => {
  const hierarchy = ['viewer', 'member', 'admin', 'owner'];
  const member = workspace.members.find(m => 
    m.userId.toString() === userId.toString()
  );
  if (!member) return false;
  return hierarchy.indexOf(member.role) >= hierarchy.indexOf(minRole);
};

export const getUserRole = (workspace, userId) => {
  const member = workspace.members.find(m => 
    m.userId.toString() === userId.toString()
  );
  return member?.role || null;
};