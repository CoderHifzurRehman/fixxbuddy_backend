const Partner = require('../models/partner.model');
const Team = require('../models/team.model');
const Hub = require('../models/hub.model');
const Mainservices = require('../models/mainServices.model');
const Cart = require('../models/cart.model');

const normalizeRole = (role) => (role || '').toUpperCase();

/**
 * Ensures Manager is ACTIVE. If INACTIVE, blocks management operations.
 */
const requireActiveManager = async (req, res, next) => {
  try {
    const role = normalizeRole(req.user?.role);
    if (role !== 'MANAGER') {
      return next();
    }

    const managerId = req.user.id || req.user._id;
    const manager = await Partner.findById(managerId).select('managerConfig');
    if (!manager || manager.managerConfig?.status !== 'ACTIVE') {
      return res.status(403).json({
        statusCode: 403,
        message: 'Access denied: Your Manager account is currently INACTIVE. Contact Admin for activation.'
      });
    }

    req.managerConfig = manager.managerConfig;
    next();
  } catch (err) {
    return res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * Ensures Team Leader is ACTIVE. If INACTIVE, blocks management operations.
 */
const requireActiveTeamLeader = async (req, res, next) => {
  try {
    const role = normalizeRole(req.user?.role);
    if (role !== 'TEAM_LEADER') {
      return next();
    }

    const leaderId = req.user.id || req.user._id;
    const leader = await Partner.findById(leaderId).select('teamLeaderConfig');
    if (!leader || leader.teamLeaderConfig?.status !== 'ACTIVE') {
      return res.status(403).json({
        statusCode: 403,
        message: 'Access denied: Your Team Leader account is currently INACTIVE. Contact Admin for activation.'
      });
    }

    req.teamLeaderConfig = leader.teamLeaderConfig;
    next();
  } catch (err) {
    return res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * Checks whether a specific target resource is within the Manager's scope.
 * Prevents URL parameter and query tampering for Managers.
 */
const checkManagerScope = (resourceType = 'partner') => {
  return async (req, res, next) => {
    try {
      const role = normalizeRole(req.user?.role);
      // Admin / Subadmin bypass
      if (role === 'ADMIN' || role === 'SUBADMIN') {
        return next();
      }

      if (role !== 'MANAGER') {
        return next();
      }

      const managerId = req.user.id || req.user._id;
      const manager = await Partner.findById(managerId);
      if (!manager || manager.managerConfig?.status !== 'ACTIVE') {
        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied: Manager account is inactive or not found'
        });
      }

      const resourceId = req.params.id || req.params.requestId || req.params.partnerId || req.params.teamId || req.params.categoryId || req.params.areaId;
      if (!resourceId) {
        return next();
      }

      // Check self-access
      if (resourceId.toString() === managerId.toString()) {
        return next();
      }

      if (resourceType === 'team') {
        const team = await Team.findById(resourceId);
        if (!team) {
          return res.status(404).json({ statusCode: 404, message: 'Team not found' });
        }
        const managedTeams = (manager.managerConfig?.managedTeams || []).map(t => t.toString());
        if (
          team.managerId &&
          team.managerId.toString() === managerId.toString() &&
          managedTeams.includes(team._id.toString())
        ) {
          return next();
        }
        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied: Team is outside your management scope'
        });
      }

      if (resourceType === 'team_leader') {
        const leader = await Partner.findById(resourceId);
        if (!leader) {
          return res.status(404).json({ statusCode: 404, message: 'Team Leader not found' });
        }
        if (leader.teamLeaderConfig?.managerId?.toString() === managerId.toString()) {
          return next();
        }
        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied: Team Leader does not report to you'
        });
      }

      if (resourceType === 'partner') {
        const targetPartner = await Partner.findById(resourceId);
        if (!targetPartner) {
          return res.status(404).json({ statusCode: 404, message: 'Partner not found' });
        }

        // Check if partner is a team leader under this manager
        if (targetPartner.teamLeaderConfig?.managerId?.toString() === managerId.toString()) {
          return next();
        }

        // Check if partner belongs to a team managed by this manager
        if (targetPartner.teamId) {
          const team = await Team.findById(targetPartner.teamId);
          if (team && team.managerId?.toString() === managerId.toString()) {
            return next();
          }
        }

        // Check if partner matches manager's managed areas AND categories
        const managedAreas = (manager.managerConfig?.managedAreas || []).map(a => a.toString());
        const hubs = await Hub.find({ _id: { $in: managedAreas } }).select('name pincodes');
        const hubNames = hubs.map(h => h.name);
        const allPincodes = hubs.flatMap(h => h.pincodes || []);

        const hasMatchingHub = (targetPartner.hub || []).some(h => hubNames.includes(h)) ||
                               allPincodes.includes(targetPartner.address?.pincode);

        if (hasMatchingHub) {
          return next();
        }

        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied: Partner is outside your management scope'
        });
      }

      if (resourceType === 'category') {
        const managedCategories = (manager.managerConfig?.managedCategories || []).map(c => c.toString());
        if (managedCategories.includes(resourceId.toString())) {
          return next();
        }
        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied: Category is outside your management scope'
        });
      }

      if (resourceType === 'area') {
        const managedAreas = (manager.managerConfig?.managedAreas || []).map(a => a.toString());
        if (managedAreas.includes(resourceId.toString())) {
          return next();
        }
        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied: Area / Hub is outside your management scope'
        });
      }

      if (resourceType === 'request') {
        const targetRequest = await Cart.findById(resourceId);
        if (!targetRequest) {
          return res.status(404).json({ statusCode: 404, message: 'Service request not found' });
        }

        // If assigned to a partner, check if that partner belongs to a team under this manager
        if (targetRequest.assignedPartner) {
          const assignedPartner = await Partner.findById(targetRequest.assignedPartner);
          if (assignedPartner?.teamId) {
            const team = await Team.findById(assignedPartner.teamId);
            if (team && team.managerId?.toString() === managerId.toString()) {
              return next();
            }
          }
          return res.status(403).json({
            statusCode: 403,
            message: 'Access denied: Service request belongs to another manager scope'
          });
        }

        // If unassigned, verify it falls into manager's categories or areas
        const managedCategories = (manager.managerConfig?.managedCategories || []).map(c => c.toString());
        const managedAreas = (manager.managerConfig?.managedAreas || []).map(a => a.toString());
        const hubs = await Hub.find({ _id: { $in: managedAreas } }).select('name pincodes');
        const hubNames = hubs.map(h => h.name);
        const allPincodes = hubs.flatMap(h => h.pincodes || []);

        const matchesCategory = targetRequest.mainServiceId && managedCategories.includes(targetRequest.mainServiceId.toString());
        const matchesArea = (targetRequest.deliveryAddress?.postalCode && allPincodes.includes(targetRequest.deliveryAddress.postalCode)) ||
                            (targetRequest.deliveryAddress?.city && hubNames.includes(targetRequest.deliveryAddress.city));

        if (matchesCategory || matchesArea) {
          return next();
        }

        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied: Unassigned service request is outside your operational categories and areas'
        });
      }

      next();
    } catch (err) {
      return res.status(500).json({ statusCode: 500, message: err.message });
    }
  };
};

/**
 * Checks whether a specific target resource is within the Team Leader's scope.
 * Prevents URL parameter and query tampering for Team Leaders.
 */
const checkTeamLeaderScope = (resourceType = 'partner') => {
  return async (req, res, next) => {
    try {
      const role = normalizeRole(req.user?.role);
      if (role === 'ADMIN' || role === 'SUBADMIN') {
        return next();
      }

      if (role !== 'TEAM_LEADER') {
        return next();
      }

      const leaderId = req.user.id || req.user._id;
      const leader = await Partner.findById(leaderId);
      if (!leader || leader.teamLeaderConfig?.status !== 'ACTIVE') {
        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied: Team Leader account is inactive or not found'
        });
      }

      const assignedTeamId = leader.teamLeaderConfig?.teamId;
      if (!assignedTeamId) {
        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied: You are not currently assigned to an active team'
        });
      }

      const resourceId = req.params.id || req.params.requestId || req.params.partnerId || req.params.teamId;

      if (resourceType === 'team' && resourceId) {
        if (resourceId.toString() !== assignedTeamId.toString()) {
          return res.status(403).json({
            statusCode: 403,
            message: 'Access denied: You can only access your own assigned team'
          });
        }
      }

      if (resourceType === 'partner' && resourceId) {
        if (resourceId.toString() === leaderId.toString()) {
          return next();
        }

        const targetPartner = await Partner.findById(resourceId);
        if (!targetPartner) {
          return res.status(404).json({ statusCode: 404, message: 'Partner not found' });
        }

        if (!targetPartner.teamId || targetPartner.teamId.toString() !== assignedTeamId.toString()) {
          return res.status(403).json({
            statusCode: 403,
            message: 'Access denied: Partner is not a member of your squad'
          });
        }
      }

      if (resourceType === 'request' && resourceId) {
        const targetRequest = await Cart.findById(resourceId);
        if (!targetRequest) {
          return res.status(404).json({ statusCode: 404, message: 'Service request not found' });
        }

        if (!targetRequest.assignedPartner) {
          return res.status(403).json({
            statusCode: 403,
            message: 'Access denied: Unassigned requests can only be managed by Managers or Admins'
          });
        }

        const partner = await Partner.findById(targetRequest.assignedPartner);
        if (!partner || !partner.teamId || partner.teamId.toString() !== assignedTeamId.toString()) {
          return res.status(403).json({
            statusCode: 403,
            message: 'Access denied: This request is not assigned to a member of your squad'
          });
        }
      }

      next();
    } catch (err) {
      return res.status(500).json({ statusCode: 500, message: err.message });
    }
  };
};

module.exports = {
  normalizeRole,
  requireActiveManager,
  requireActiveTeamLeader,
  checkManagerScope,
  checkTeamLeaderScope
};
