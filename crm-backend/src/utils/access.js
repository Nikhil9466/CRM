// Apply these predicates to reads AND record lookups before mutations.
function memberScope(user) {
  const base = { orgId: user.orgId };
  if (user.role === "ADMIN") return base;
  if (user.role === "SUB_ADMIN" && user.teamId)
    return { ...base, teamId: user.teamId };
  return { ...base, id: user.id };
}
function recordScope(user, model) {
  const base = { orgId: user.orgId };
  if (user.role === "ADMIN" || !model || model === "stage") return base;
  if (model === "user") return memberScope(user);
  const assignment =
    user.role === "SUB_ADMIN" && user.teamId
      ? { assignee: { orgId: user.orgId, teamId: user.teamId } }
      : { assigneeId: user.id };
  if (model === "deal") return { ...base, AND: [{ contact: assignment }] };
  if (model === "task")
    return {
      ...base,
      AND: [
        assignment,
        {
          OR: [
            { contactId: null, dealId: null },
            { contact: assignment },
            { deal: { contact: assignment } },
          ],
        },
      ],
    };
  return { ...base, AND: [assignment] };
}
module.exports = { recordScope, memberScope };
