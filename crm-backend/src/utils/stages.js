module.exports = (orgId) => [
  { orgId, name: "New", kind: "OPEN", position: 0 },
  { orgId, name: "Contacted", kind: "OPEN", position: 1 },
  { orgId, name: "Proposal", kind: "OPEN", position: 2 },
  { orgId, name: "Won", kind: "WON", position: 3 },
  { orgId, name: "Lost", kind: "LOST", position: 4 },
];
