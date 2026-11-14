const { ROLES } = require('../constants');

const STAFF_ROLES = [ROLES.MODERATOR, ROLES.ADMIN];

const isStaff = (user) => Boolean(user) && STAFF_ROLES.includes(user.role);

const isAdmin = (user) => Boolean(user) && user.role === ROLES.ADMIN;

// Works for raw ObjectIds, populated documents and lean results alike.
const reporterIdOf = (report) =>
  report.reporter && report.reporter._id ? report.reporter._id : report.reporter;

const isOwner = (report, user) =>
  Boolean(user) && String(reporterIdOf(report)) === String(user._id ?? user.id);

module.exports = { isStaff, isAdmin, isOwner, reporterIdOf };
