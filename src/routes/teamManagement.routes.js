const express = require('express');
const router = express.Router();
const controller = require('../controllers/teamManagement.controller');
const { authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');
const { 
  requireActiveManager, 
  requireActiveTeamLeader, 
  checkManagerScope, 
  checkTeamLeaderScope 
} = require('../middlewares/scopeMiddleware');

// ==========================================
// TEAM LEADER-SCOPED OPERATIONS (Team Leader only)
// ==========================================
router.get(
  '/team-leader/my-dashboard',
  authMiddleware,
  authorizeRoles('TEAM_LEADER'),
  requireActiveTeamLeader,
  controller.getMyTeamLeaderDashboard
);

router.get(
  '/team-leader/my-team',
  authMiddleware,
  authorizeRoles('TEAM_LEADER'),
  requireActiveTeamLeader,
  controller.getMyTeamLeaderTeam
);

router.get(
  '/team-leader/my-partners',
  authMiddleware,
  authorizeRoles('TEAM_LEADER'),
  requireActiveTeamLeader,
  controller.getMyTeamLeaderPartners
);

// ==========================================
// MANAGER-SCOPED OPERATIONS (PART 5 - Active Manager Required)
// ==========================================
router.get(
  '/manager/my-dashboard', 
  authMiddleware, 
  authorizeRoles('MANAGER'), 
  requireActiveManager, 
  controller.getMyDashboardSummary
);

router.get(
  '/manager/my-teams', 
  authMiddleware, 
  authorizeRoles('MANAGER'), 
  requireActiveManager, 
  controller.getMyTeams
);

router.get(
  '/manager/my-team-leaders', 
  authMiddleware, 
  authorizeRoles('MANAGER'), 
  requireActiveManager, 
  controller.getMyTeamLeaders
);

router.get(
  '/manager/my-partners', 
  authMiddleware, 
  authorizeRoles('MANAGER'), 
  requireActiveManager, 
  controller.getMyPartners
);

router.get(
  '/manager/unassigned-partners',
  authMiddleware,
  authorizeRoles('MANAGER'),
  requireActiveManager,
  controller.getUnassignedPartners
);

router.get(
  '/manager/my-categories',
  authMiddleware,
  authorizeRoles('MANAGER'),
  requireActiveManager,
  controller.getMyCategories
);

router.get(
  '/manager/my-areas',
  authMiddleware,
  authorizeRoles('MANAGER'),
  requireActiveManager,
  controller.getMyAreas
);

router.get(
  '/manager/my-operations',
  authMiddleware,
  authorizeRoles('MANAGER'),
  requireActiveManager,
  controller.getMyOperations
);

// Backward-compatible summary
router.get(
  '/dashboard-summary', 
  authMiddleware, 
  controller.getDashboardSummary
);

// ==========================================
// TEAM LEADER MANAGEMENT (Admin, and Manager for inspection/scope)
// ==========================================
router.get(
  '/team-leaders', 
  authMiddleware, 
  authorizeRoles('ADMIN', 'SUBADMIN', 'MANAGER'), 
  requireActiveManager,
  controller.getTeamLeaders
);

router.get(
  '/team-leaders/:id', 
  authMiddleware, 
  authorizeRoles('ADMIN', 'SUBADMIN', 'MANAGER'), 
  requireActiveManager,
  controller.getTeamLeaderById
);

router.put(
  '/team-leaders/:id/scope', 
  authMiddleware, 
  authorizeRoles('ADMIN', 'SUBADMIN', 'MANAGER'), 
  requireActiveManager,
  controller.updateTeamLeaderScope
);

router.patch(
  '/team-leaders/:id/reassign', 
  authMiddleware, 
  authorizeRoles('ADMIN', 'SUBADMIN'), 
  controller.reassignTeamLeader
);

// ==========================================
// MANAGER MANAGEMENT OPERATIONS (Admin only)
// ==========================================
router.get(
  '/managers', 
  authMiddleware, 
  authorizeRoles('ADMIN', 'SUBADMIN'), 
  controller.getManagers
);

router.get(
  '/managers/:id', 
  authMiddleware, 
  authorizeRoles('ADMIN', 'SUBADMIN'), 
  controller.getManagerById
);

router.put(
  '/managers/:id/scope', 
  authMiddleware, 
  authorizeRoles('ADMIN', 'SUBADMIN'), 
  controller.updateManagerScope
);

// ==========================================
// GENERAL TEAMS & PARTNER ASSIGNMENT (PART 4 & 5)
// ==========================================
router.get(
  '/teams', 
  authMiddleware, 
  authorizeRoles('ADMIN', 'SUBADMIN', 'MANAGER'), 
  requireActiveManager,
  controller.getTeams
);

router.post(
  '/teams', 
  authMiddleware, 
  authorizeRoles('ADMIN', 'SUBADMIN', 'MANAGER'), 
  requireActiveManager,
  controller.createTeam
);

router.get(
  '/teams/:id',
  authMiddleware,
  authorizeRoles('ADMIN', 'SUBADMIN', 'MANAGER', 'TEAM_LEADER'),
  requireActiveManager,
  controller.getTeamById
);

router.put(
  '/teams/:id', 
  authMiddleware, 
  authorizeRoles('ADMIN', 'SUBADMIN', 'MANAGER'), 
  requireActiveManager,
  controller.updateTeam
);

router.patch(
  '/teams/:id/status',
  authMiddleware,
  authorizeRoles('ADMIN', 'SUBADMIN', 'MANAGER'),
  requireActiveManager,
  controller.toggleTeamStatus
);

router.get(
  '/teams/:teamId/eligible-partners',
  authMiddleware,
  authorizeRoles('ADMIN', 'SUBADMIN', 'MANAGER'),
  requireActiveManager,
  controller.getEligiblePartnersForTeam
);

router.post(
  '/teams/:teamId/partners/:partnerId',
  authMiddleware,
  authorizeRoles('ADMIN', 'SUBADMIN', 'MANAGER'),
  requireActiveManager,
  controller.assignPartnerToTeam
);

router.delete(
  '/teams/:teamId/partners/:partnerId',
  authMiddleware,
  authorizeRoles('ADMIN', 'SUBADMIN', 'MANAGER'),
  requireActiveManager,
  controller.removePartnerFromTeam
);

router.patch(
  '/partners/:partnerId/transfer',
  authMiddleware,
  authorizeRoles('ADMIN', 'SUBADMIN', 'MANAGER'),
  requireActiveManager,
  controller.transferPartner
);

// ==========================================
// GLOBAL MANAGEMENT ACTIONS (Promote, Role, Status, Audit)
// ==========================================
router.post(
  '/promote', 
  authMiddleware, 
  authorizeRoles('ADMIN', 'SUBADMIN'), 
  controller.promotePartner
);

router.patch(
  '/change-role/:partnerId', 
  authMiddleware, 
  authorizeRoles('ADMIN', 'SUBADMIN'), 
  controller.changeRole
);

router.patch(
  '/status/:partnerId', 
  authMiddleware, 
  authorizeRoles('ADMIN', 'SUBADMIN'), 
  controller.toggleManagementStatus
);

router.get(
  '/audit-logs', 
  authMiddleware, 
  authorizeRoles('ADMIN', 'SUBADMIN'), 
  controller.getAuditLogs
);


// ==========================================
// PART 6: SERVICE REQUEST / JOB ASSIGNMENT OPERATIONS
// ==========================================
router.get(
  '/team-leader/requests',
  authMiddleware,
  authorizeRoles('TEAM_LEADER'),
  requireActiveTeamLeader,
  controller.getTeamLeaderRequests
);

router.get(
  '/team-leader/requests/:id',
  authMiddleware,
  authorizeRoles('TEAM_LEADER'),
  requireActiveTeamLeader,
  checkTeamLeaderScope('request'),
  controller.getTeamLeaderRequestById
);

router.get(
  '/manager/requests',
  authMiddleware,
  authorizeRoles('MANAGER'),
  requireActiveManager,
  controller.getManagerRequests
);

router.get(
  '/manager/requests/stats',
  authMiddleware,
  authorizeRoles('MANAGER'),
  requireActiveManager,
  controller.getManagerRequestStats
);

router.get(
  '/manager/requests/:id',
  authMiddleware,
  authorizeRoles('ADMIN', 'SUBADMIN', 'MANAGER'),
  requireActiveManager,
  checkManagerScope('request'),
  controller.getManagerRequestById
);

router.patch(
  '/requests/:requestId/assign',
  authMiddleware,
  authorizeRoles('ADMIN', 'SUBADMIN', 'MANAGER'),
  requireActiveManager,
  controller.assignJob
);

router.patch(
  '/requests/:requestId/reassign',
  authMiddleware,
  authorizeRoles('ADMIN', 'SUBADMIN', 'MANAGER'),
  requireActiveManager,
  controller.reassignJob
);

router.patch(
  '/requests/:requestId/status',
  authMiddleware,
  authorizeRoles('ADMIN', 'SUBADMIN', 'MANAGER', 'TEAM_LEADER'),
  controller.updateJobStatus
);


// ==========================================
// PART 7: OPERATIONAL TRACKING, SCHEDULING & WORKLOAD
// ==========================================
router.patch(
  '/requests/:requestId/reschedule',
  authMiddleware,
  authorizeRoles('ADMIN', 'SUBADMIN', 'MANAGER'),
  requireActiveManager,
  controller.rescheduleJob
);

router.get(
  '/manager/workload',
  authMiddleware,
  authorizeRoles('MANAGER'),
  requireActiveManager,
  controller.getManagerWorkload
);

router.get(
  '/team-leader/workload',
  authMiddleware,
  authorizeRoles('TEAM_LEADER'),
  requireActiveTeamLeader,
  controller.getTeamLeaderWorkload
);

router.get(
  '/manager/schedule-board',
  authMiddleware,
  authorizeRoles('MANAGER'),
  requireActiveManager,
  controller.getManagerScheduleBoard
);

router.get(
  '/team-leader/schedule-board',
  authMiddleware,
  authorizeRoles('TEAM_LEADER'),
  requireActiveTeamLeader,
  controller.getTeamLeaderScheduleBoard
);

router.get(
  '/partners/:partnerId/availability',
  authMiddleware,
  authorizeRoles('ADMIN', 'SUBADMIN', 'MANAGER', 'TEAM_LEADER', 'PARTNER'),
  controller.getPartnerAvailability
);

router.patch(
  '/partners/:partnerId/availability',
  authMiddleware,
  authorizeRoles('ADMIN', 'SUBADMIN', 'MANAGER', 'TEAM_LEADER', 'PARTNER'),
  controller.updatePartnerAvailability
);


// ==========================================
// PART 7: OPERATIONAL TRACKING, SCHEDULING & WORKLOAD
// ==========================================
router.patch(
  '/requests/:requestId/reschedule',
  authMiddleware,
  authorizeRoles('ADMIN', 'SUBADMIN', 'MANAGER', 'TEAM_LEADER'),
  controller.rescheduleJob
);

router.get(
  '/manager/workload',
  authMiddleware,
  authorizeRoles('MANAGER'),
  requireActiveManager,
  controller.getManagerWorkload
);

router.get(
  '/team-leader/workload',
  authMiddleware,
  authorizeRoles('TEAM_LEADER'),
  requireActiveTeamLeader,
  controller.getTeamLeaderWorkload
);

router.get(
  '/manager/schedule-board',
  authMiddleware,
  authorizeRoles('MANAGER'),
  requireActiveManager,
  controller.getManagerScheduleBoard
);

router.get(
  '/team-leader/schedule-board',
  authMiddleware,
  authorizeRoles('TEAM_LEADER'),
  requireActiveTeamLeader,
  controller.getTeamLeaderScheduleBoard
);

router.get(
  '/partners/:partnerId/availability',
  authMiddleware,
  authorizeRoles('ADMIN', 'SUBADMIN', 'MANAGER', 'TEAM_LEADER', 'PARTNER'),
  controller.getPartnerAvailability
);

router.patch(
  '/partners/:partnerId/availability',
  authMiddleware,
  authorizeRoles('ADMIN', 'SUBADMIN', 'MANAGER', 'TEAM_LEADER', 'PARTNER'),
  controller.updatePartnerAvailability
);

module.exports = router;



