const mongoose = require('mongoose');
const Partner = require('../models/partner.model');
const Team = require('../models/team.model');
const ManagementAudit = require('../models/managementAudit.model');
const Mainservices = require('../models/mainServices.model');
const MainservicesCategories = require('../models/mainServicesCategories.model');
const Hub = require('../models/hub.model');
const Cart = require('../models/cart.model');
const ably = require('../utils/ably');

const normalizeRole = (role) => (role || '').toUpperCase();

/**
 * 1. Get all Managers with real database summary counts (Admin only)
 */
exports.getManagers = async (req, res) => {
  try {
    const managers = await Partner.find({
      role: 'MANAGER',
      isDeleted: false
    })
      .populate('managerConfig.managedCategories', 'serviceName serviceHeading')
      .populate('managerConfig.managedAreas', 'name pincodes')
      .populate('managerConfig.managedTeams', 'name code status categories areas')
      .select('partnerId firstName lastName fullName email contactNumber profilePic role managerConfig isActive createdAt')
      .sort({ createdAt: -1 });

    const enhancedManagers = await Promise.all(
      managers.map(async (mgr) => {
        const mgrObj = mgr.toObject();

        const teamLeadersCount = await Partner.countDocuments({
          role: 'TEAM_LEADER',
          'teamLeaderConfig.managerId': mgr._id,
          isDeleted: false
        });

        const teams = await Team.find({ managerId: mgr._id }).select('_id members');
        const teamIds = teams.map(t => t._id);

        const partnersCount = await Partner.countDocuments({
          role: 'PARTNER',
          teamId: { $in: teamIds },
          isDeleted: false
        });

        return {
          ...mgrObj,
          stats: {
            teamLeadersCount,
            teamsCount: teams.length,
            partnersCount
          }
        };
      })
    );

    res.status(200).json({
      statusCode: 200,
      message: 'Managers fetched successfully',
      data: enhancedManagers
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 2. Get Single Manager Details by ID (Admin only)
 */
exports.getManagerById = async (req, res) => {
  try {
    const { id } = req.params;
    const manager = await Partner.findOne({ _id: id, role: 'MANAGER', isDeleted: false })
      .populate('managerConfig.managedCategories', 'serviceName serviceHeading')
      .populate('managerConfig.managedAreas', 'name pincodes')
      .populate('managerConfig.managedTeams', 'name code status categories areas');

    if (!manager) {
      return res.status(404).json({ statusCode: 404, message: 'Manager not found' });
    }

    const teamLeaders = await Partner.find({
      role: 'TEAM_LEADER',
      'teamLeaderConfig.managerId': manager._id,
      isDeleted: false
    })
      .populate('teamLeaderConfig.teamId', 'name code status')
      .select('partnerId fullName email contactNumber profilePic teamLeaderConfig isActive averageRating');

    const teams = await Team.find({ managerId: manager._id })
      .populate('teamLeaderId', 'partnerId fullName email contactNumber')
      .populate('categories', 'serviceName serviceHeading')
      .populate('areas', 'name')
      .populate('members', 'partnerId fullName email contactNumber designation profilePic averageRating');

    const teamIds = teams.map(t => t._id);

    const partners = await Partner.find({
      role: 'PARTNER',
      teamId: { $in: teamIds },
      isDeleted: false
    }).select('partnerId fullName email contactNumber designation profilePic address averageRating teamId isActive');

    res.status(200).json({
      statusCode: 200,
      message: 'Manager details fetched successfully',
      data: {
        personalInfo: {
          _id: manager._id,
          partnerId: manager.partnerId,
          firstName: manager.firstName,
          lastName: manager.lastName,
          fullName: manager.fullName,
          email: manager.email,
          contactNumber: manager.contactNumber,
          profilePic: manager.profilePic,
          role: manager.role,
          isActive: manager.isActive,
          averageRating: manager.averageRating,
          createdAt: manager.createdAt
        },
        scope: {
          managedCategories: manager.managerConfig?.managedCategories || [],
          managedAreas: manager.managerConfig?.managedAreas || [],
          managedTeams: manager.managerConfig?.managedTeams || [],
          status: manager.managerConfig?.status || 'ACTIVE',
          assignedAt: manager.managerConfig?.assignedAt
        },
        stats: {
          teamsCount: teams.length,
          teamLeadersCount: teamLeaders.length,
          partnersCount: partners.length
        },
        teamLeaders,
        teams,
        partners
      }
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 3. Update Manager Scope (Admin only)
 */
exports.updateManagerScope = async (req, res) => {
  try {
    const { id } = req.params;
    const { managedCategories, managedAreas, managedTeams, status } = req.body;

    const manager = await Partner.findOne({ _id: id, role: 'MANAGER', isDeleted: false });
    if (!manager) {
      return res.status(404).json({ statusCode: 404, message: 'Manager not found' });
    }

    const previousScope = { ...manager.managerConfig?.toObject() };

    if (!manager.managerConfig) {
      manager.managerConfig = {};
    }

    if (managedCategories !== undefined) manager.managerConfig.managedCategories = managedCategories;
    if (managedAreas !== undefined) manager.managerConfig.managedAreas = managedAreas;
    if (managedTeams !== undefined) {
      manager.managerConfig.managedTeams = managedTeams;
      await Team.updateMany({ managerId: manager._id, _id: { $nin: managedTeams } }, { managerId: null });
      if (managedTeams.length > 0) {
        await Team.updateMany({ _id: { $in: managedTeams } }, { managerId: manager._id });
      }
    }
    if (status !== undefined) manager.managerConfig.status = status;

    await manager.save();

    await ManagementAudit.create({
      action: 'MANAGER_SCOPE_UPDATED',
      performedBy: {
        id: req.user?.id || req.user?._id,
        name: req.user?.fullName || req.user?.firstName || 'Admin',
        role: req.user?.role || 'ADMIN'
      },
      targetUser: {
        id: manager._id,
        name: manager.fullName,
        partnerId: manager.partnerId,
        role: 'MANAGER'
      },
      details: {
        previousScope,
        updatedScope: manager.managerConfig
      }
    });

    res.status(200).json({
      statusCode: 200,
      message: 'Manager scope updated successfully',
      data: manager
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 4. PROMOTE PARTNER (IN-PLACE TO MANAGER OR TEAM LEADER)
 */
exports.promotePartner = async (req, res) => {
  try {
    const { partnerId, targetRole, config } = req.body;
    const adminUser = req.user;

    if (!partnerId || !targetRole) {
      return res.status(400).json({ statusCode: 400, message: 'partnerId and targetRole are required' });
    }

    const normalizedTarget = normalizeRole(targetRole);
    if (!['MANAGER', 'TEAM_LEADER'].includes(normalizedTarget)) {
      return res.status(400).json({ statusCode: 400, message: 'Invalid targetRole. Must be MANAGER or TEAM_LEADER' });
    }

    const partner = await Partner.findOne({ _id: partnerId, isDeleted: false });
    if (!partner) {
      return res.status(404).json({ statusCode: 404, message: 'Partner not found' });
    }

    const previousRole = normalizeRole(partner.role);

    if (normalizedTarget === 'MANAGER') {
      const { managedCategories = [], managedAreas = [], managedTeams = [], status = 'ACTIVE' } = config || {};

      partner.role = 'MANAGER';
      partner.managerConfig = {
        managedCategories,
        managedAreas,
        managedTeams,
        status,
        assignedBy: adminUser.id || adminUser._id || null,
        assignedAt: new Date()
      };

      await partner.save();

      if (managedTeams.length > 0) {
        await Team.updateMany(
          { _id: { $in: managedTeams } },
          { managerId: partner._id }
        );
      }

      await ManagementAudit.create({
        action: 'PROMOTED_TO_MANAGER',
        performedBy: {
          id: adminUser.id || adminUser._id,
          name: adminUser.fullName || adminUser.firstName || 'Admin',
          role: adminUser.role || 'ADMIN'
        },
        targetUser: {
          id: partner._id,
          name: partner.fullName,
          partnerId: partner.partnerId,
          role: 'MANAGER'
        },
        previousRole,
        newRole: 'MANAGER',
        details: { managedCategories, managedAreas, managedTeams, status }
      });

      return res.status(200).json({
        statusCode: 200,
        message: `${partner.fullName} successfully promoted to Manager in-place`,
        data: partner
      });
    }

    if (normalizedTarget === 'TEAM_LEADER') {
      const { managerId, teamId, managedCategories = [], managedAreas = [], status = 'ACTIVE' } = config || {};

      if (!managerId) {
        return res.status(400).json({ statusCode: 400, message: 'Reporting Manager (managerId) is mandatory for Team Leader' });
      }
      if (!teamId) {
        return res.status(400).json({ statusCode: 400, message: 'Assigned Team (teamId) is mandatory for Team Leader' });
      }

      const manager = await Partner.findOne({ _id: managerId, role: 'MANAGER', isDeleted: false });
      if (!manager) {
        return res.status(404).json({ statusCode: 404, message: 'Selected Manager not found' });
      }

      const team = await Team.findById(teamId);
      if (!team) {
        return res.status(404).json({ statusCode: 404, message: 'Selected Team not found' });
      }

      if (!team.managerId || team.managerId.toString() !== managerId.toString()) {
        return res.status(400).json({
          statusCode: 400,
          message: 'Cross-manager error: Selected Team does not belong to the selected Reporting Manager.'
        });
      }

      if (team.teamLeaderId && team.teamLeaderId._id.toString() !== partner._id.toString()) {
        const existingLeader = await Partner.findById(team.teamLeaderId._id);
        if (existingLeader && normalizeRole(existingLeader.role) === 'TEAM_LEADER' && existingLeader.teamLeaderConfig?.status === 'ACTIVE') {
          return res.status(409).json({
            statusCode: 409,
            conflict: true,
            message: 'This team already has an active Team Leader. Choose another team or explicitly reassign the current Team Leader.',
            currentTeamLeader: {
              _id: existingLeader._id,
              partnerId: existingLeader.partnerId,
              fullName: existingLeader.fullName
            }
          });
        }
      }

      partner.role = 'TEAM_LEADER';
      partner.teamLeaderConfig = {
        managerId,
        teamId,
        managedCategories: managedCategories.length > 0 ? managedCategories : (team.categories || []),
        managedAreas: managedAreas.length > 0 ? managedAreas : (team.areas || []),
        status,
        assignedBy: adminUser.id || adminUser._id || null,
        assignedAt: new Date()
      };

      await partner.save();

      team.teamLeaderId = partner._id;
      await team.save();

      await ManagementAudit.create({
        action: 'PROMOTED_TO_TEAM_LEADER',
        performedBy: {
          id: adminUser.id || adminUser._id,
          name: adminUser.fullName || adminUser.firstName || 'Admin',
          role: adminUser.role || 'ADMIN'
        },
        targetUser: {
          id: partner._id,
          name: partner.fullName,
          partnerId: partner.partnerId,
          role: 'TEAM_LEADER'
        },
        previousRole,
        newRole: 'TEAM_LEADER',
        details: { managerId, teamId, status }
      });

      return res.status(200).json({
        statusCode: 200,
        message: `${partner.fullName} successfully promoted to Team Leader in-place`,
        data: partner
      });
    }
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 5. GET TEAM LEADERS (Scoped by Manager if caller is MANAGER)
 */
exports.getTeamLeaders = async (req, res) => {
  try {
    const callerRole = normalizeRole(req.user?.role);
    const query = { role: 'TEAM_LEADER', isDeleted: false };

    if (callerRole === 'MANAGER') {
      const managerId = req.user.id || req.user._id;
      query['teamLeaderConfig.managerId'] = managerId;
    }

    const leaders = await Partner.find(query)
      .populate('teamLeaderConfig.managerId', 'partnerId fullName email contactNumber')
      .populate('teamLeaderConfig.teamId', 'name code status')
      .populate('teamLeaderConfig.managedCategories', 'serviceName serviceHeading')
      .populate('teamLeaderConfig.managedAreas', 'name pincodes')
      .select('partnerId firstName lastName fullName email contactNumber profilePic role teamLeaderConfig isActive createdAt')
      .sort({ createdAt: -1 });

    const enhanced = await Promise.all(
      leaders.map(async (l) => {
        let partnersCount = 0;
        let activePartnersCount = 0;
        let inactivePartnersCount = 0;

        const teamId = l.teamLeaderConfig?.teamId?._id || l.teamLeaderConfig?.teamId;
        if (teamId) {
          partnersCount = await Partner.countDocuments({ role: 'PARTNER', teamId, isDeleted: false });
          activePartnersCount = await Partner.countDocuments({ role: 'PARTNER', teamId, isActive: true, isDeleted: false });
          inactivePartnersCount = await Partner.countDocuments({ role: 'PARTNER', teamId, isActive: false, isDeleted: false });
        }

        return {
          ...l.toObject(),
          stats: {
            partnersCount,
            activePartnersCount,
            inactivePartnersCount
          }
        };
      })
    );

    res.status(200).json({
      statusCode: 200,
      message: 'Team Leaders fetched successfully',
      data: enhanced
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 6. GET SINGLE TEAM LEADER BY ID (Scoped by Manager)
 */
exports.getTeamLeaderById = async (req, res) => {
  try {
    const { id } = req.params;
    const callerRole = normalizeRole(req.user?.role);

    const leader = await Partner.findOne({ _id: id, role: 'TEAM_LEADER', isDeleted: false })
      .populate('teamLeaderConfig.managerId', 'partnerId fullName email contactNumber profilePic')
      .populate('teamLeaderConfig.teamId', 'name code status categories areas')
      .populate('teamLeaderConfig.managedCategories', 'serviceName serviceHeading')
      .populate('teamLeaderConfig.managedAreas', 'name pincodes');

    if (!leader) {
      return res.status(404).json({ statusCode: 404, message: 'Team Leader not found' });
    }

    if (callerRole === 'MANAGER') {
      const managerId = req.user.id || req.user._id;
      if (!leader.teamLeaderConfig?.managerId || leader.teamLeaderConfig.managerId._id.toString() !== managerId.toString()) {
        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied: This Team Leader does not report to you.'
        });
      }
    }

    let partners = [];
    let partnersCount = 0;
    let activePartnersCount = 0;
    let inactivePartnersCount = 0;

    const teamId = leader.teamLeaderConfig?.teamId?._id || leader.teamLeaderConfig?.teamId;
    if (teamId) {
      partners = await Partner.find({ role: 'PARTNER', teamId, isDeleted: false })
        .select('partnerId fullName email contactNumber designation profilePic address averageRating isActive');
      partnersCount = partners.length;
      activePartnersCount = partners.filter(p => p.isActive).length;
      inactivePartnersCount = partnersCount - activePartnersCount;
    }

    res.status(200).json({
      statusCode: 200,
      message: 'Team Leader details fetched successfully',
      data: {
        personalInfo: {
          _id: leader._id,
          partnerId: leader.partnerId,
          firstName: leader.firstName,
          lastName: leader.lastName,
          fullName: leader.fullName,
          email: leader.email,
          contactNumber: leader.contactNumber,
          profilePic: leader.profilePic,
          role: leader.role,
          isActive: leader.isActive,
          averageRating: leader.averageRating,
          createdAt: leader.createdAt
        },
        assignment: {
          manager: leader.teamLeaderConfig?.managerId || null,
          team: leader.teamLeaderConfig?.teamId || null,
          managedCategories: leader.teamLeaderConfig?.managedCategories || [],
          managedAreas: leader.teamLeaderConfig?.managedAreas || [],
          status: leader.teamLeaderConfig?.status || 'ACTIVE',
          assignedAt: leader.teamLeaderConfig?.assignedAt
        },
        stats: {
          partnersCount,
          activePartnersCount,
          inactivePartnersCount
        },
        partners
      }
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 7. UPDATE TEAM LEADER SCOPE (Admin or Manager with strict scope bounding)
 */
exports.updateTeamLeaderScope = async (req, res) => {
  try {
    const { id } = req.params;
    const { managerId, teamId, managedCategories, managedAreas, status } = req.body;
    const callerRole = normalizeRole(req.user?.role);

    const leader = await Partner.findOne({ _id: id, role: 'TEAM_LEADER', isDeleted: false });
    if (!leader) {
      return res.status(404).json({ statusCode: 404, message: 'Team Leader not found' });
    }

    // Strict Manager Scope Bounding
    if (callerRole === 'MANAGER') {
      const authManagerId = req.user.id || req.user._id;
      const currentMgrId = leader.teamLeaderConfig?.managerId?.toString();

      if (currentMgrId !== authManagerId.toString()) {
        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied: You do not manage this Team Leader.'
        });
      }

      if (managerId && managerId.toString() !== authManagerId.toString()) {
        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied: You cannot reassign a Team Leader to another Manager.'
        });
      }

      const managerUser = await Partner.findById(authManagerId).select('managerConfig');
      const managerTeams = (managerUser?.managerConfig?.managedTeams || []).map(t => t.toString());
      const managerCats = (managerUser?.managerConfig?.managedCategories || []).map(c => c.toString());
      const managerHubs = (managerUser?.managerConfig?.managedAreas || []).map(a => a.toString());

      if (teamId) {
        const targetTeam = await Team.findById(teamId);
        if (!targetTeam || !managerTeams.includes(teamId.toString()) || targetTeam.managerId?.toString() !== authManagerId.toString()) {
          return res.status(403).json({
            statusCode: 403,
            message: 'Access denied: Selected team is outside your management scope.'
          });
        }
      }

      if (managedCategories && managedCategories.length > 0) {
        const hasUnauthorizedCat = managedCategories.some(c => !managerCats.includes(c.toString()));
        if (hasUnauthorizedCat) {
          return res.status(403).json({
            statusCode: 403,
            message: 'Access denied: You cannot assign categories outside your Manager scope.'
          });
        }
      }

      if (managedAreas && managedAreas.length > 0) {
        const hasUnauthorizedArea = managedAreas.some(a => !managerHubs.includes(a.toString()));
        if (hasUnauthorizedArea) {
          return res.status(403).json({
            statusCode: 403,
            message: 'Access denied: You cannot assign areas outside your Manager scope.'
          });
        }
      }
    }

    const previousConfig = { ...leader.teamLeaderConfig?.toObject() };
    const currentTeamId = leader.teamLeaderConfig?.teamId?.toString();
    const newTeamId = teamId ? teamId.toString() : currentTeamId;
    const newManagerId = managerId || leader.teamLeaderConfig?.managerId?.toString();

    if (newTeamId && newManagerId) {
      const team = await Team.findById(newTeamId);
      if (!team) {
        return res.status(404).json({ statusCode: 404, message: 'Team not found' });
      }
      if (!team.managerId || team.managerId.toString() !== newManagerId.toString()) {
        return res.status(400).json({
          statusCode: 400,
          message: 'Cross-manager error: Team does not belong to the selected Manager.'
        });
      }

      if (newTeamId !== currentTeamId && team.teamLeaderId && team.teamLeaderId.toString() !== leader._id.toString()) {
        const currentLeader = await Partner.findById(team.teamLeaderId);
        if (currentLeader && normalizeRole(currentLeader.role) === 'TEAM_LEADER' && currentLeader.teamLeaderConfig?.status === 'ACTIVE') {
          return res.status(409).json({
            statusCode: 409,
            conflict: true,
            message: 'Target team already has an active Team Leader. Use explicit Reassign action to change leadership.',
            currentTeamLeader: {
              _id: currentLeader._id,
              partnerId: currentLeader.partnerId,
              fullName: currentLeader.fullName
            }
          });
        }
      }
    }

    if (!leader.teamLeaderConfig) leader.teamLeaderConfig = {};
    if (managerId !== undefined) leader.teamLeaderConfig.managerId = managerId;
    if (teamId !== undefined) leader.teamLeaderConfig.teamId = teamId;
    if (managedCategories !== undefined) leader.teamLeaderConfig.managedCategories = managedCategories;
    if (managedAreas !== undefined) leader.teamLeaderConfig.managedAreas = managedAreas;
    if (status !== undefined) leader.teamLeaderConfig.status = status;

    if (teamId !== undefined && teamId !== currentTeamId) {
      if (currentTeamId) {
        await Team.findByIdAndUpdate(currentTeamId, { teamLeaderId: null });
      }
      await Team.findByIdAndUpdate(teamId, { teamLeaderId: leader._id });
    }

    await leader.save();

    await ManagementAudit.create({
      action: 'TEAM_LEADER_SCOPE_UPDATED',
      performedBy: {
        id: req.user?.id || req.user?._id,
        name: req.user?.fullName || req.user?.firstName || 'Admin',
        role: req.user?.role || 'ADMIN'
      },
      targetUser: {
        id: leader._id,
        name: leader.fullName,
        partnerId: leader.partnerId,
        role: 'TEAM_LEADER'
      },
      details: {
        previousConfig,
        updatedConfig: leader.teamLeaderConfig
      }
    });

    res.status(200).json({
      statusCode: 200,
      message: 'Team Leader scope updated successfully',
      data: leader
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 8. EXPLICIT REASSIGN TEAM LEADER
 */
exports.reassignTeamLeader = async (req, res) => {
  try {
    const { id } = req.params;
    const { targetTeamId } = req.body;

    if (!targetTeamId) {
      return res.status(400).json({ statusCode: 400, message: 'targetTeamId is required' });
    }

    const newLeader = await Partner.findOne({ _id: id, role: 'TEAM_LEADER', isDeleted: false });
    if (!newLeader) {
      return res.status(404).json({ statusCode: 404, message: 'New Team Leader not found' });
    }

    const team = await Team.findById(targetTeamId);
    if (!team) {
      return res.status(404).json({ statusCode: 404, message: 'Target team not found' });
    }
    if (newLeader.teamLeaderConfig?.status !== 'ACTIVE') {
      return res.status(400).json({ statusCode: 400, message: 'Selected Team Leader is INACTIVE. Activate them first.' });
    }

    if (newLeader.teamLeaderConfig?.managerId && team.managerId) {
      if (newLeader.teamLeaderConfig.managerId.toString() !== team.managerId.toString()) {
        return res.status(400).json({
          statusCode: 400,
          message: 'Cross-manager error: New Team Leader reports to a different Manager than the Team.'
        });
      }
    }

    const oldLeader = team.teamLeaderId ? await Partner.findById(team.teamLeaderId._id) : null;

    if (oldLeader) {
      if (!oldLeader.teamLeaderConfig) oldLeader.teamLeaderConfig = {};
      oldLeader.teamLeaderConfig.teamId = null;
      await oldLeader.save();
    }

    if (!newLeader.teamLeaderConfig) newLeader.teamLeaderConfig = {};
    newLeader.teamLeaderConfig.teamId = team._id;
    newLeader.teamLeaderConfig.managerId = team.managerId;
    await newLeader.save();

    team.teamLeaderId = newLeader._id;
    await team.save();

    await ManagementAudit.create({
      action: 'TEAM_LEADER_REASSIGNED',
      performedBy: {
        id: req.user?.id || req.user?._id,
        name: req.user?.fullName || req.user?.firstName || 'Admin',
        role: req.user?.role || 'ADMIN'
      },
      targetUser: {
        id: newLeader._id,
        name: newLeader.fullName,
        partnerId: newLeader.partnerId,
        role: 'TEAM_LEADER'
      },
      details: {
        team: { id: team._id, name: team.name, code: team.code },
        previousTeamLeader: oldLeader ? { id: oldLeader._id, partnerId: oldLeader.partnerId, name: oldLeader.fullName } : null,
        newTeamLeader: { id: newLeader._id, partnerId: newLeader.partnerId, name: newLeader.fullName },
        managerId: team.managerId
      }
    });

    res.status(200).json({
      statusCode: 200,
      message: `Team leadership successfully reassigned to ${newLeader.fullName}`,
      data: {
        team,
        previousLeader: oldLeader ? { id: oldLeader._id, name: oldLeader.fullName, partnerId: oldLeader.partnerId } : null,
        newLeader: { id: newLeader._id, name: newLeader.fullName, partnerId: newLeader.partnerId }
      }
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 9. SAFE DEMOTION / ROLE CHANGE
 */
exports.changeRole = async (req, res) => {
  try {
    const { partnerId } = req.params;
    const { newRole, force = false } = req.body;

    const partner = await Partner.findById(partnerId);
    if (!partner) {
      return res.status(404).json({ statusCode: 404, message: 'Partner not found' });
    }

    const currentRole = normalizeRole(partner.role);
    const targetRole = normalizeRole(newRole);

    if (currentRole === targetRole) {
      return res.status(400).json({ statusCode: 400, message: 'Partner already has this role' });
    }

    if (currentRole === 'MANAGER' && !force) {
      const assignedLeaders = await Partner.find({
        role: 'TEAM_LEADER',
        'teamLeaderConfig.managerId': partner._id,
        isDeleted: false
      }).select('fullName partnerId');

      const assignedTeams = await Team.find({ managerId: partner._id }).select('name code members');
      const teamIds = assignedTeams.map(t => t._id);

      const partnersCount = await Partner.countDocuments({
        role: 'PARTNER',
        teamId: { $in: teamIds },
        isDeleted: false
      });

      if (assignedLeaders.length > 0 || assignedTeams.length > 0 || partnersCount > 0) {
        return res.status(409).json({
          statusCode: 409,
          requiresConfirmation: true,
          message: `Cannot safely demote this Manager yet. Current assignments: ${assignedTeams.length} Team(s), ${assignedLeaders.length} Team Leader(s), ${partnersCount} Partner(s). Please reassign these resources first.`,
          dependencies: {
            teamsCount: assignedTeams.length,
            teamLeadersCount: assignedLeaders.length,
            partnersCount,
            teamLeaders: assignedLeaders,
            teams: assignedTeams
          }
        });
      }
    }

    if (currentRole === 'TEAM_LEADER' && !force) {
      const teamId = partner.teamLeaderConfig?.teamId;
      if (teamId) {
        const assignedTeam = await Team.findById(teamId).select('name code members');
        const partnersCount = await Partner.countDocuments({ role: 'PARTNER', teamId, isDeleted: false });

        if (assignedTeam && partnersCount > 0) {
          return res.status(409).json({
            statusCode: 409,
            requiresConfirmation: true,
            message: `This Team Leader currently manages team "${assignedTeam.name}" with ${partnersCount} partner(s). Please confirm demotion to Partner.`,
            dependencies: {
              team: assignedTeam,
              partnersCount
            }
          });
        }
      }
    }

    partner.role = targetRole;

    if (targetRole === 'PARTNER') {
      if (currentRole === 'MANAGER') {
        partner.managerConfig = undefined;
        await Team.updateMany({ managerId: partner._id }, { managerId: null });
        await Partner.updateMany({ 'teamLeaderConfig.managerId': partner._id }, { 'teamLeaderConfig.managerId': null });
      }
      if (currentRole === 'TEAM_LEADER') {
        const tId = partner.teamLeaderConfig?.teamId;
        if (tId) {
          await Team.findByIdAndUpdate(tId, { teamLeaderId: null });
        }
        partner.teamLeaderConfig = undefined;
      }
    }

    await partner.save();

    await ManagementAudit.create({
      action: 'DEMOTED_TO_PARTNER',
      performedBy: {
        id: req.user?.id || req.user?._id,
        name: req.user?.fullName || req.user?.firstName || 'Admin',
        role: req.user?.role || 'ADMIN'
      },
      targetUser: {
        id: partner._id,
        name: partner.fullName,
        partnerId: partner.partnerId,
        role: targetRole
      },
      previousRole,
      newRole: targetRole,
      details: { forced: force }
    });

    res.status(200).json({
      statusCode: 200,
      message: `Role for ${partner.fullName} updated to ${targetRole}`,
      data: partner
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 10. Toggle Management Status (ACTIVE / INACTIVE)
 */
exports.toggleManagementStatus = async (req, res) => {
  try {
    const { partnerId } = req.params;
    const partner = await Partner.findById(partnerId);
    if (!partner) {
      return res.status(404).json({ statusCode: 404, message: 'Partner not found' });
    }

    const role = normalizeRole(partner.role);
    let newStatus = 'ACTIVE';

    if (role === 'MANAGER' && partner.managerConfig) {
      newStatus = partner.managerConfig.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      partner.managerConfig.status = newStatus;
    } else if (role === 'TEAM_LEADER' && partner.teamLeaderConfig) {
      newStatus = partner.teamLeaderConfig.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      partner.teamLeaderConfig.status = newStatus;
    } else {
      return res.status(400).json({ statusCode: 400, message: 'Partner is not a Manager or Team Leader' });
    }

    await partner.save();

    await ManagementAudit.create({
      action: 'STATUS_TOGGLED',
      performedBy: {
        id: req.user?.id || req.user?._id,
        name: req.user?.fullName || req.user?.firstName || 'Admin',
        role: req.user?.role || 'ADMIN'
      },
      targetUser: {
        id: partner._id,
        name: partner.fullName,
        partnerId: partner.partnerId,
        role
      },
      details: { newStatus }
    });

    res.status(200).json({
      statusCode: 200,
      message: `Management status for ${partner.fullName} set to ${newStatus}`,
      data: { partnerId: partner._id, status: newStatus }
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 11. TEAM LEADER SCOPED: My Dashboard Summary
 */
exports.getMyTeamLeaderDashboard = async (req, res) => {
  try {
    const leaderId = req.user.id || req.user._id;
    const leader = await Partner.findById(leaderId)
      .populate('teamLeaderConfig.managerId', 'partnerId fullName email contactNumber profilePic')
      .populate('teamLeaderConfig.teamId', 'name code status categories areas')
      .populate('teamLeaderConfig.managedCategories', 'serviceName serviceHeading')
      .populate('teamLeaderConfig.managedAreas', 'name pincodes');

    if (!leader) {
      return res.status(404).json({ statusCode: 404, message: 'Team Leader not found' });
    }

    const team = leader.teamLeaderConfig?.teamId;
    let partnersCount = 0;
    let activePartnersCount = 0;
    let inactivePartnersCount = 0;

    if (team) {
      partnersCount = await Partner.countDocuments({ role: 'PARTNER', teamId: team._id, isDeleted: false });
      activePartnersCount = await Partner.countDocuments({ role: 'PARTNER', teamId: team._id, isActive: true, isDeleted: false });
      inactivePartnersCount = await Partner.countDocuments({ role: 'PARTNER', teamId: team._id, isActive: false, isDeleted: false });
    }

    res.status(200).json({
      statusCode: 200,
      message: 'Team Leader dashboard fetched successfully',
      data: {
        name: leader.fullName,
        partnerId: leader.partnerId,
        status: leader.teamLeaderConfig?.status || 'ACTIVE',
        team: team ? {
          _id: team._id,
          name: team.name,
          code: team.code,
          status: team.status
        } : null,
        manager: leader.teamLeaderConfig?.managerId || null,
        categories: leader.teamLeaderConfig?.managedCategories || [],
        areas: leader.teamLeaderConfig?.managedAreas || [],
        stats: {
          partnersCount,
          activePartnersCount,
          inactivePartnersCount
        }
      }
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 12. TEAM LEADER SCOPED: My Team
 */
exports.getMyTeamLeaderTeam = async (req, res) => {
  try {
    const leaderId = req.user.id || req.user._id;
    const leader = await Partner.findById(leaderId).select('teamLeaderConfig');

    if (!leader || !leader.teamLeaderConfig?.teamId) {
      return res.status(404).json({ statusCode: 404, message: 'No team currently assigned to this Team Leader' });
    }

    const team = await Team.findById(leader.teamLeaderConfig.teamId)
      .populate('managerId', 'partnerId fullName email contactNumber')
      .populate('teamLeaderId', 'partnerId fullName email contactNumber profilePic')
      .populate('categories', 'serviceName serviceHeading')
      .populate('areas', 'name pincodes')
      .populate('members', 'partnerId fullName email contactNumber designation profilePic averageRating isActive');

    if (!team) {
      return res.status(404).json({ statusCode: 404, message: 'Assigned team not found' });
    }

    res.status(200).json({
      statusCode: 200,
      message: 'Team Leader team fetched successfully',
      data: team
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 13. TEAM LEADER SCOPED: My Partners
 */
exports.getMyTeamLeaderPartners = async (req, res) => {
  try {
    const leaderId = req.user.id || req.user._id;
    const leader = await Partner.findById(leaderId).select('teamLeaderConfig');

    if (!leader || !leader.teamLeaderConfig?.teamId) {
      return res.status(200).json({
        statusCode: 200,
        message: 'No team assigned',
        data: [],
        totalCount: 0
      });
    }

    const { search = '', status = 'ALL' } = req.query;

    const query = {
      role: 'PARTNER',
      teamId: leader.teamLeaderConfig.teamId,
      isDeleted: false
    };

    if (status !== 'ALL') {
      query.isActive = status === 'ACTIVE';
    }

    if (search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { fullName: regex },
        { partnerId: regex },
        { email: regex },
        { contactNumber: regex }
      ];
    }

    const partners = await Partner.find(query)
      .populate('teamId', 'name code')
      .select('partnerId fullName email contactNumber designation profilePic address averageRating totalRatings teamId isActive')
      .sort({ createdAt: -1 });

    res.status(200).json({
      statusCode: 200,
      message: 'Team partners fetched successfully',
      data: partners,
      totalCount: partners.length
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 14. MANAGER SCOPED: My Dashboard Summary (PART 5)
 */
exports.getMyDashboardSummary = async (req, res) => {
  try {
    const managerId = req.user?.id || req.user?._id;
    const manager = await Partner.findById(managerId)
      .populate('managerConfig.managedCategories', 'serviceName serviceHeading serviceDescription serviceImage isActive')
      .populate('managerConfig.managedAreas', 'name pincodes isActive');

    if (!manager) {
      return res.status(404).json({ statusCode: 404, message: 'Manager not found' });
    }

    const managedTeamIds = (manager.managerConfig?.managedTeams || []).map(t => t.toString());

    // Fetch only teams owned by this manager and in scope
    const teams = await Team.find({
      managerId,
      _id: { $in: managedTeamIds }
    }).select('_id name code status members teamLeaderId categories areas');

    const activeTeamsCount = teams.filter(t => t.status === 'ACTIVE').length;
    const inactiveTeamsCount = teams.length - activeTeamsCount;
    const teamsWithoutLeaderCount = teams.filter(t => !t.teamLeaderId).length;

    const teamIds = teams.map(t => t._id);

    const teamLeaders = await Partner.find({
      role: 'TEAM_LEADER',
      'teamLeaderConfig.managerId': manager._id,
      isDeleted: false
    }).select('partnerId fullName email contactNumber profilePic teamLeaderConfig isActive averageRating');

    const partnersCount = await Partner.countDocuments({
      role: 'PARTNER',
      teamId: { $in: teamIds },
      isDeleted: false
    });

    const activePartnersCount = await Partner.countDocuments({
      role: 'PARTNER',
      teamId: { $in: teamIds },
      isActive: true,
      isDeleted: false
    });

    const inactivePartnersCount = partnersCount - activePartnersCount;

    // Unassigned partners in manager's scope
    const managedAreas = (manager.managerConfig?.managedAreas || []);
    const hubNames = managedAreas.map(a => a.name);
    const hubPincodes = managedAreas.flatMap(a => a.pincodes || []);

    const managedCategories = (manager.managerConfig?.managedCategories || []);
    const categoryHeadings = managedCategories.flatMap(c => [c.serviceName, c.serviceHeading].filter(Boolean));

    const unassignedMatchQuery = {
      role: 'PARTNER',
      isDeleted: false,
      $or: [
        { teamId: null },
        { teamId: { $exists: false } }
      ]
    };

    const scopeConditions = [];
    if (hubNames.length > 0) {
      scopeConditions.push({ hub: { $in: hubNames } });
    }
    if (hubPincodes.length > 0) {
      scopeConditions.push({ 'address.pincode': { $in: hubPincodes } });
    }
    if (categoryHeadings.length > 0) {
      scopeConditions.push({ expertise: { $in: categoryHeadings } });
      scopeConditions.push({ designation: { $in: categoryHeadings } });
    }

    if (scopeConditions.length > 0) {
      unassignedMatchQuery.$and = [{ $or: scopeConditions }];
    }

    const unassignedPartnersCount = await Partner.countDocuments(unassignedMatchQuery);

    res.status(200).json({
      statusCode: 200,
      message: 'Manager dashboard summary fetched successfully',
      data: {
        name: manager.fullName,
        partnerId: manager.partnerId,
        status: manager.managerConfig?.status || 'ACTIVE',
        categoriesCount: manager.managerConfig?.managedCategories?.length || 0,
        areasCount: manager.managerConfig?.managedAreas?.length || 0,
        categories: manager.managerConfig?.managedCategories || [],
        areas: manager.managerConfig?.managedAreas || [],
        stats: {
          teamsCount: teams.length,
          activeTeamsCount,
          inactiveTeamsCount,
          teamsWithoutLeaderCount,
          teamLeadersCount: teamLeaders.length,
          partnersCount,
          activePartnersCount,
          inactivePartnersCount,
          unassignedPartnersCount,
          categoriesCount: manager.managerConfig?.managedCategories?.length || 0,
          areasCount: manager.managerConfig?.managedAreas?.length || 0
        },
        teams,
        teamLeaders
      }
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 15. MANAGER SCOPED: My Teams (PART 5)
 */
exports.getMyTeams = async (req, res) => {
  try {
    const managerId = req.user?.id || req.user?._id;
    const manager = await Partner.findById(managerId).select('managerConfig');
    const managedTeamIds = (manager?.managerConfig?.managedTeams || []).map(t => t.toString());

    const teams = await Team.find({
      managerId,
      _id: { $in: managedTeamIds }
    })
      .populate('teamLeaderId', 'partnerId fullName email contactNumber profilePic')
      .populate('categories', 'serviceName serviceHeading')
      .populate('areas', 'name pincodes')
      .populate('members', 'partnerId fullName email contactNumber designation profilePic isActive averageRating')
      .sort({ createdAt: -1 });

    const enhanced = await Promise.all(
      teams.map(async (team) => {
        const teamObj = team.toObject();
        const partnersCount = await Partner.countDocuments({ role: 'PARTNER', teamId: team._id, isDeleted: false });
        const activePartnersCount = await Partner.countDocuments({ role: 'PARTNER', teamId: team._id, isActive: true, isDeleted: false });
        const inactivePartnersCount = partnersCount - activePartnersCount;

        return {
          ...teamObj,
          stats: {
            partnersCount,
            activePartnersCount,
            inactivePartnersCount
          }
        };
      })
    );

    res.status(200).json({
      statusCode: 200,
      message: 'Manager teams fetched successfully',
      data: enhanced
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 16. MANAGER SCOPED: My Team Leaders (PART 5)
 */
exports.getMyTeamLeaders = async (req, res) => {
  try {
    const managerId = req.user?.id || req.user?._id;
    const leaders = await Partner.find({
      role: 'TEAM_LEADER',
      'teamLeaderConfig.managerId': managerId,
      isDeleted: false
    })
      .populate('teamLeaderConfig.teamId', 'name code status categories areas')
      .populate('teamLeaderConfig.managedCategories', 'serviceName serviceHeading')
      .populate('teamLeaderConfig.managedAreas', 'name pincodes')
      .select('partnerId fullName email contactNumber profilePic teamLeaderConfig isActive averageRating createdAt')
      .sort({ createdAt: -1 });

    const enhanced = await Promise.all(
      leaders.map(async (l) => {
        let partnersCount = 0;
        let activePartnersCount = 0;
        let inactivePartnersCount = 0;

        const teamId = l.teamLeaderConfig?.teamId?._id || l.teamLeaderConfig?.teamId;
        if (teamId) {
          partnersCount = await Partner.countDocuments({
            role: 'PARTNER',
            teamId,
            isDeleted: false
          });
          activePartnersCount = await Partner.countDocuments({
            role: 'PARTNER',
            teamId,
            isActive: true,
            isDeleted: false
          });
          inactivePartnersCount = partnersCount - activePartnersCount;
        }

        return {
          ...l.toObject(),
          stats: {
            partnersCount,
            activePartnersCount,
            inactivePartnersCount
          }
        };
      })
    );

    res.status(200).json({
      statusCode: 200,
      message: 'Manager team leaders fetched successfully',
      data: enhanced
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 17. MANAGER SCOPED: My Partners with Live Search & Scope Guard (PART 5)
 */
exports.getMyPartners = async (req, res) => {
  try {
    const managerId = req.user?.id || req.user?._id;
    const { search = '', teamId, status = 'ALL' } = req.query;

    const manager = await Partner.findById(managerId).select('managerConfig');
    const managedTeamIds = (manager?.managerConfig?.managedTeams || []).map(t => t.toString());

    // Teams owned by manager and in scope
    const teams = await Team.find({
      managerId,
      _id: { $in: managedTeamIds }
    }).select('_id name');
    const teamIds = teams.map(t => t._id);

    // If query passes teamId, verify it is inside manager's teams
    let targetTeamFilter = { $in: teamIds };
    if (teamId) {
      if (!teamIds.some(id => id.toString() === teamId.toString())) {
        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied: Requested team is outside your management scope'
        });
      }
      targetTeamFilter = teamId;
    }

    const query = {
      role: 'PARTNER',
      isDeleted: false,
      teamId: targetTeamFilter
    };

    if (status !== 'ALL') {
      query.isActive = status === 'ACTIVE';
    }

    if (search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { fullName: regex },
        { partnerId: regex },
        { email: regex },
        { contactNumber: regex }
      ];
    }

    const partners = await Partner.find(query)
      .populate({
        path: 'teamId',
        select: 'name code status managerId teamLeaderId',
        populate: [
          { path: 'managerId', select: 'fullName partnerId' },
          { path: 'teamLeaderId', select: 'fullName partnerId' }
        ]
      })
      .select('partnerId fullName email contactNumber designation profilePic address averageRating totalRatings teamId isActive createdAt hub expertise')
      .sort({ createdAt: -1 });

    res.status(200).json({
      statusCode: 200,
      message: 'Manager partners fetched successfully',
      data: partners,
      totalCount: partners.length
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 18. MANAGER SCOPED: Unassigned Partners in Scope (PART 5)
 */
exports.getUnassignedPartners = async (req, res) => {
  try {
    const managerId = req.user?.id || req.user?._id;
    const { search = '' } = req.query;

    const manager = await Partner.findById(managerId)
      .populate('managerConfig.managedCategories', 'serviceName serviceHeading')
      .populate('managerConfig.managedAreas', 'name pincodes');

    if (!manager) {
      return res.status(404).json({ statusCode: 404, message: 'Manager not found' });
    }

    const managedAreas = manager.managerConfig?.managedAreas || [];
    const hubNames = managedAreas.map(a => a.name);
    const hubPincodes = managedAreas.flatMap(a => a.pincodes || []);

    const managedCategories = manager.managerConfig?.managedCategories || [];
    const categoryHeadings = managedCategories.flatMap(c => [c.serviceName, c.serviceHeading].filter(Boolean));

    const query = {
      role: 'PARTNER',
      isDeleted: false,
      $or: [
        { teamId: null },
        { teamId: { $exists: false } }
      ]
    };

    const scopeConditions = [];
    if (hubNames.length > 0) {
      scopeConditions.push({ hub: { $in: hubNames } });
    }
    if (hubPincodes.length > 0) {
      scopeConditions.push({ 'address.pincode': { $in: hubPincodes } });
    }
    if (categoryHeadings.length > 0) {
      scopeConditions.push({ expertise: { $in: categoryHeadings } });
      scopeConditions.push({ designation: { $in: categoryHeadings } });
    }

    if (scopeConditions.length > 0) {
      query.$and = [{ $or: scopeConditions }];
    }

    if (search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      const searchConditions = [
        { fullName: regex },
        { partnerId: regex },
        { contactNumber: regex },
        { email: regex }
      ];
      if (query.$and) {
        query.$and.push({ $or: searchConditions });
      } else {
        query.$and = [{ $or: searchConditions }];
      }
    }

    const unassignedPartners = await Partner.find(query)
      .select('partnerId fullName email contactNumber designation profilePic address averageRating hub expertise isActive createdAt')
      .sort({ createdAt: -1 })
      .limit(100);

    res.status(200).json({
      statusCode: 200,
      message: 'Unassigned partners within manager scope fetched successfully',
      data: unassignedPartners,
      totalCount: unassignedPartners.length
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 19. MANAGER SCOPED: My Categories View (PART 5)
 */
exports.getMyCategories = async (req, res) => {
  try {
    const managerId = req.user?.id || req.user?._id;
    const manager = await Partner.findById(managerId).select('managerConfig');

    if (!manager) {
      return res.status(404).json({ statusCode: 404, message: 'Manager not found' });
    }

    const categoryIds = manager.managerConfig?.managedCategories || [];
    const categories = await Mainservices.find({
      _id: { $in: categoryIds }
    }).sort({ createdAt: -1 });

    const managerTeamIds = (manager.managerConfig?.managedTeams || []).map(t => t.toString());

    const enhanced = await Promise.all(
      categories.map(async (cat) => {
        const catObj = cat.toObject();

        // Sub-services count
        const serviceCount = await MainservicesCategories.countDocuments({
          mainServiceId: cat._id,
          isActive: true
        });

        // Teams belonging to this manager assigned to this category
        const teams = await Team.find({
          managerId,
          _id: { $in: managerTeamIds },
          categories: cat._id
        }).select('_id members');

        const teamIds = teams.map(t => t._id);

        // Partners in these teams
        const partnersCount = await Partner.countDocuments({
          role: 'PARTNER',
          teamId: { $in: teamIds },
          isDeleted: false
        });

        return {
          ...catObj,
          stats: {
            serviceCount,
            teamsCount: teams.length,
            partnersCount
          }
        };
      })
    );

    res.status(200).json({
      statusCode: 200,
      message: 'Manager categories fetched successfully',
      data: enhanced
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 20. MANAGER SCOPED: My Areas / Hubs View (PART 5)
 */
exports.getMyAreas = async (req, res) => {
  try {
    const managerId = req.user?.id || req.user?._id;
    const manager = await Partner.findById(managerId).select('managerConfig');

    if (!manager) {
      return res.status(404).json({ statusCode: 404, message: 'Manager not found' });
    }

    const areaIds = manager.managerConfig?.managedAreas || [];
    const hubs = await Hub.find({
      _id: { $in: areaIds }
    }).sort({ createdAt: -1 });

    const managerTeamIds = (manager.managerConfig?.managedTeams || []).map(t => t.toString());

    const enhanced = await Promise.all(
      hubs.map(async (hub) => {
        const hubObj = hub.toObject();

        // Teams belonging to this manager assigned to this hub
        const teams = await Team.find({
          managerId,
          _id: { $in: managerTeamIds },
          areas: hub._id
        }).select('_id teamLeaderId');

        const teamIds = teams.map(t => t._id);

        // Team leaders covering this area
        const teamLeadersCount = await Partner.countDocuments({
          role: 'TEAM_LEADER',
          'teamLeaderConfig.managerId': managerId,
          $or: [
            { 'teamLeaderConfig.teamId': { $in: teamIds } },
            { 'teamLeaderConfig.managedAreas': hub._id }
          ],
          isDeleted: false
        });

        // Partners in these teams
        const partnersCount = await Partner.countDocuments({
          role: 'PARTNER',
          teamId: { $in: teamIds },
          isDeleted: false
        });

        return {
          ...hubObj,
          stats: {
            teamsCount: teams.length,
            teamLeadersCount,
            partnersCount
          }
        };
      })
    );

    res.status(200).json({
      statusCode: 200,
      message: 'Manager areas fetched successfully',
      data: enhanced
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 21. MANAGER SCOPED: Consolidated Operations API (PART 5)
 */
exports.getMyOperations = async (req, res) => {
  try {
    const managerId = req.user?.id || req.user?._id;
    const manager = await Partner.findById(managerId)
      .populate('managerConfig.managedCategories', 'serviceName serviceHeading serviceDescription serviceImage isActive')
      .populate('managerConfig.managedAreas', 'name pincodes isActive');

    if (!manager) {
      return res.status(404).json({ statusCode: 404, message: 'Manager not found' });
    }

    const managedTeamIds = (manager.managerConfig?.managedTeams || []).map(t => t.toString());

    // Teams
    const teams = await Team.find({
      managerId,
      _id: { $in: managedTeamIds }
    })
      .populate('teamLeaderId', 'partnerId fullName email contactNumber')
      .populate('categories', 'serviceName serviceHeading')
      .populate('areas', 'name pincodes')
      .sort({ createdAt: -1 });

    const teamIds = teams.map(t => t._id);

    // Team Leaders
    const teamLeaders = await Partner.find({
      role: 'TEAM_LEADER',
      'teamLeaderConfig.managerId': manager._id,
      isDeleted: false
    })
      .populate('teamLeaderConfig.teamId', 'name code status')
      .select('partnerId fullName email contactNumber profilePic teamLeaderConfig isActive averageRating')
      .sort({ createdAt: -1 });

    // Partners count
    const partnersCount = await Partner.countDocuments({
      role: 'PARTNER',
      teamId: { $in: teamIds },
      isDeleted: false
    });
    const activePartnersCount = await Partner.countDocuments({
      role: 'PARTNER',
      teamId: { $in: teamIds },
      isActive: true,
      isDeleted: false
    });
    const inactivePartnersCount = partnersCount - activePartnersCount;

    // Unassigned partners in scope
    const managedAreas = manager.managerConfig?.managedAreas || [];
    const hubNames = managedAreas.map(a => a.name);
    const hubPincodes = managedAreas.flatMap(a => a.pincodes || []);

    const managedCategories = manager.managerConfig?.managedCategories || [];
    const categoryHeadings = managedCategories.flatMap(c => [c.serviceName, c.serviceHeading].filter(Boolean));

    const unassignedMatchQuery = {
      role: 'PARTNER',
      isDeleted: false,
      $or: [
        { teamId: null },
        { teamId: { $exists: false } }
      ]
    };

    const scopeConditions = [];
    if (hubNames.length > 0) scopeConditions.push({ hub: { $in: hubNames } });
    if (hubPincodes.length > 0) scopeConditions.push({ 'address.pincode': { $in: hubPincodes } });
    if (categoryHeadings.length > 0) {
      scopeConditions.push({ expertise: { $in: categoryHeadings } });
      scopeConditions.push({ designation: { $in: categoryHeadings } });
    }

    if (scopeConditions.length > 0) {
      unassignedMatchQuery.$and = [{ $or: scopeConditions }];
    }

    const unassignedPartnersCount = await Partner.countDocuments(unassignedMatchQuery);

    res.status(200).json({
      statusCode: 200,
      message: 'Manager operations consolidated payload fetched successfully',
      data: {
        manager: {
          _id: manager._id,
          partnerId: manager.partnerId,
          fullName: manager.fullName,
          status: manager.managerConfig?.status || 'ACTIVE',
          createdAt: manager.createdAt
        },
        categories: manager.managerConfig?.managedCategories || [],
        areas: manager.managerConfig?.managedAreas || [],
        teams,
        teamLeaders,
        summary: {
          teamsCount: teams.length,
          activeTeamsCount: teams.filter(t => t.status === 'ACTIVE').length,
          inactiveTeamsCount: teams.filter(t => t.status === 'INACTIVE').length,
          teamsWithoutLeaderCount: teams.filter(t => !t.teamLeaderId).length,
          teamLeadersCount: teamLeaders.length,
          partnersCount,
          activePartnersCount,
          inactivePartnersCount,
          unassignedPartnersCount,
          categoriesCount: manager.managerConfig?.managedCategories?.length || 0,
          areasCount: manager.managerConfig?.managedAreas?.length || 0
        }
      }
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 22. GENERAL TEAMS (Scoped if caller is Manager; Global if Admin)
 */
exports.getTeams = async (req, res) => {
  try {
    const callerRole = normalizeRole(req.user?.role);
    const query = {};

    if (callerRole === 'MANAGER') {
      const managerId = req.user.id || req.user._id;
      const manager = await Partner.findById(managerId).select('managerConfig');
      const managedTeams = (manager?.managerConfig?.managedTeams || []).map(t => t.toString());
      query.managerId = managerId;
      query._id = { $in: managedTeams };
    }

    const teams = await Team.find(query)
      .populate('managerId', 'partnerId fullName email contactNumber')
      .populate('teamLeaderId', 'partnerId fullName email contactNumber')
      .populate('categories', 'serviceName serviceHeading')
      .populate('areas', 'name pincodes')
      .populate('members', 'partnerId fullName email contactNumber designation profilePic isActive')
      .sort({ createdAt: -1 });

    const enhanced = await Promise.all(
      teams.map(async (team) => {
        const teamObj = team.toObject();
        const partnersCount = await Partner.countDocuments({ role: 'PARTNER', teamId: team._id, isDeleted: false });
        const activePartnersCount = await Partner.countDocuments({ role: 'PARTNER', teamId: team._id, isActive: true, isDeleted: false });
        const inactivePartnersCount = partnersCount - activePartnersCount;

        return {
          ...teamObj,
          stats: {
            partnersCount,
            activePartnersCount,
            inactivePartnersCount
          }
        };
      })
    );

    res.status(200).json({
      statusCode: 200,
      message: 'Teams fetched successfully',
      data: enhanced
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 23. GET TEAM BY ID (Scoped by Manager ownership and managedTeams)
 */
exports.getTeamById = async (req, res) => {
  try {
    const { id } = req.params;
    const callerRole = normalizeRole(req.user?.role);

    const team = await Team.findById(id)
      .populate('managerId', 'partnerId fullName email contactNumber profilePic')
      .populate('teamLeaderId', 'partnerId fullName email contactNumber profilePic')
      .populate('categories', 'serviceName serviceHeading')
      .populate('areas', 'name pincodes');

    if (!team) {
      return res.status(404).json({ statusCode: 404, message: 'Team not found' });
    }

    // Manager scope check
    if (callerRole === 'MANAGER') {
      const managerId = req.user.id || req.user._id;
      const manager = await Partner.findById(managerId).select('managerConfig');
      const managedTeams = (manager?.managerConfig?.managedTeams || []).map(t => t.toString());

      if (
        !team.managerId ||
        team.managerId._id.toString() !== managerId.toString() ||
        !managedTeams.includes(team._id.toString())
      ) {
        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied: Team is outside your management scope'
        });
      }
    }

    // Team Leader scope check
    if (callerRole === 'TEAM_LEADER') {
      const leaderId = req.user.id || req.user._id;
      const leader = await Partner.findById(leaderId).select('teamLeaderConfig');
      if (!leader || leader.teamLeaderConfig?.teamId?.toString() !== team._id.toString()) {
        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied: This is not your assigned squad.'
        });
      }
    }

    const members = await Partner.find({ role: 'PARTNER', teamId: team._id, isDeleted: false })
      .select('partnerId fullName email contactNumber designation profilePic address averageRating isActive createdAt');

    const activeMembers = members.filter(m => m.isActive).length;
    const inactiveMembers = members.length - activeMembers;

    res.status(200).json({
      statusCode: 200,
      message: 'Team details fetched successfully',
      data: {
        _id: team._id,
        name: team.name,
        code: team.code,
        description: team.description,
        status: team.status,
        manager: team.managerId || null,
        teamLeader: team.teamLeaderId || null,
        categories: team.categories || [],
        areas: team.areas || [],
        createdAt: team.createdAt,
        stats: {
          partnersCount: members.length,
          activePartnersCount: activeMembers,
          inactivePartnersCount: inactiveMembers
        },
        members
      }
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 24. ASSIGN PARTNER TO TEAM (PART 4 + PART 5 Manager Scope Enforced)
 */
exports.assignPartnerToTeam = async (req, res) => {
  try {
    const { teamId, partnerId } = req.params;
    const callerRole = normalizeRole(req.user?.role);

    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ statusCode: 404, message: 'Team not found' });
    }

    if (team.status !== 'ACTIVE') {
      return res.status(400).json({
        statusCode: 400,
        message: 'Cannot assign partner: Target team is INACTIVE. Activate the team first.'
      });
    }

    // Manager Scope Check
    if (callerRole === 'MANAGER') {
      const managerId = req.user.id || req.user._id;
      const manager = await Partner.findById(managerId).select('managerConfig');
      const managedTeams = (manager?.managerConfig?.managedTeams || []).map(t => t.toString());

      if (
        !team.managerId ||
        team.managerId.toString() !== managerId.toString() ||
        !managedTeams.includes(team._id.toString())
      ) {
        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied: Team is outside your management scope'
        });
      }
    }

    const partner = await Partner.findOne({ _id: partnerId, isDeleted: false });
    if (!partner) {
      return res.status(404).json({ statusCode: 404, message: 'Partner not found' });
    }

    // 1 Primary Team Per Partner Rule
    if (partner.teamId) {
      if (partner.teamId.toString() === team._id.toString()) {
        return res.status(400).json({
          statusCode: 400,
          message: `${partner.fullName} is already assigned to this team.`
        });
      }

      const currentTeam = await Team.findById(partner.teamId);
      return res.status(409).json({
        statusCode: 409,
        conflict: true,
        message: `${partner.fullName} already belongs to another team (${currentTeam?.name || 'Assigned Team'}). Partners can only have 1 primary team. Use the Transfer action to move them.`,
        currentTeam: currentTeam ? {
          _id: currentTeam._id,
          name: currentTeam.name,
          code: currentTeam.code
        } : null
      });
    }

    // Synchronize relationships
    partner.teamId = team._id;
    await partner.save();

    await Team.findByIdAndUpdate(team._id, {
      $addToSet: { members: partner._id }
    });

    await ManagementAudit.create({
      action: 'PARTNER_ASSIGNED_TO_TEAM',
      performedBy: {
        id: req.user?.id || req.user?._id,
        name: req.user?.fullName || req.user?.firstName || 'Admin',
        role: req.user?.role || 'ADMIN'
      },
      targetUser: {
        id: partner._id,
        name: partner.fullName,
        partnerId: partner.partnerId,
        role: partner.role || 'PARTNER'
      },
      details: {
        team: { id: team._id, name: team.name, code: team.code }
      }
    });

    res.status(200).json({
      statusCode: 200,
      message: `${partner.fullName} successfully assigned to ${team.name}`,
      data: {
        partnerId: partner._id,
        teamId: team._id
      }
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 25. REMOVE PARTNER FROM TEAM
 */
exports.removePartnerFromTeam = async (req, res) => {
  try {
    const { teamId, partnerId } = req.params;
    const callerRole = normalizeRole(req.user?.role);

    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ statusCode: 404, message: 'Team not found' });
    }

    if (callerRole === 'MANAGER') {
      const managerId = req.user.id || req.user._id;
      const manager = await Partner.findById(managerId).select('managerConfig');
      const managedTeams = (manager?.managerConfig?.managedTeams || []).map(t => t.toString());

      if (
        !team.managerId ||
        team.managerId.toString() !== managerId.toString() ||
        !managedTeams.includes(team._id.toString())
      ) {
        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied: Team is outside your management scope'
        });
      }
    }

    const partner = await Partner.findOne({ _id: partnerId, isDeleted: false });
    if (!partner) {
      return res.status(404).json({ statusCode: 404, message: 'Partner not found' });
    }

    partner.teamId = null;
    await partner.save();

    await Team.findByIdAndUpdate(team._id, {
      $pull: { members: partner._id }
    });

    await ManagementAudit.create({
      action: 'PARTNER_REMOVED_FROM_TEAM',
      performedBy: {
        id: req.user?.id || req.user?._id,
        name: req.user?.fullName || req.user?.firstName || 'Admin',
        role: req.user?.role || 'ADMIN'
      },
      targetUser: {
        id: partner._id,
        name: partner.fullName,
        partnerId: partner.partnerId,
        role: partner.role || 'PARTNER'
      },
      details: {
        team: { id: team._id, name: team.name, code: team.code }
      }
    });

    res.status(200).json({
      statusCode: 200,
      message: `${partner.fullName} removed from ${team.name}. Account remains active.`,
      data: {
        partnerId: partner._id,
        previousTeamId: team._id
      }
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 26. TRANSFER PARTNER BETWEEN TEAMS (Transactional & Cross-Manager Protected)
 */
exports.transferPartner = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { partnerId } = req.params;
    const { targetTeamId } = req.body;
    const callerRole = normalizeRole(req.user?.role);

    if (!targetTeamId) {
      await session.abortTransaction();
      return res.status(400).json({ statusCode: 400, message: 'Target Team ID is required for transfer.' });
    }

    const partner = await Partner.findOne({ _id: partnerId, isDeleted: false }).session(session);
    if (!partner) {
      await session.abortTransaction();
      return res.status(404).json({ statusCode: 404, message: 'Partner not found' });
    }

    if (!partner.teamId) {
      await session.abortTransaction();
      return res.status(400).json({
        statusCode: 400,
        message: 'Partner does not currently belong to any team. Use standard assignment instead.'
      });
    }

    if (partner.teamId.toString() === targetTeamId.toString()) {
      await session.abortTransaction();
      return res.status(400).json({
        statusCode: 400,
        message: 'Partner is already in the target team.'
      });
    }

    const currentTeam = await Team.findById(partner.teamId).session(session);
    if (!currentTeam) {
      await session.abortTransaction();
      return res.status(404).json({ statusCode: 404, message: 'Current team not found' });
    }

    const targetTeam = await Team.findById(targetTeamId).session(session);
    if (!targetTeam) {
      await session.abortTransaction();
      return res.status(404).json({ statusCode: 404, message: 'Target team not found' });
    }

    if (targetTeam.status !== 'ACTIVE') {
      await session.abortTransaction();
      return res.status(400).json({
        statusCode: 400,
        message: 'Cannot transfer: Target team is INACTIVE.'
      });
    }

    // Cross-Manager Protection
    if (callerRole === 'TEAM_LEADER') {
      await session.abortTransaction();
      return res.status(403).json({
        statusCode: 403,
        message: 'Access denied: Team Leaders cannot transfer partners between squads.'
      });
    }

    if (callerRole === 'MANAGER') {
      const managerId = req.user.id || req.user._id;
      const currentMgrId = currentTeam.managerId?.toString();
      const targetMgrId = targetTeam.managerId?.toString();

      if (currentMgrId !== managerId.toString() || targetMgrId !== managerId.toString()) {
        await session.abortTransaction();
        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied: Cross-manager transfer is restricted. You must own both the source and target teams, or request Admin transfer.'
        });
      }
    }

    // 1. Remove Partner from sourceTeam.members
    await Team.findByIdAndUpdate(
      currentTeam._id,
      { $pull: { members: partner._id } },
      { session }
    );

    // 2. Add Partner to targetTeam.members
    await Team.findByIdAndUpdate(
      targetTeam._id,
      { $addToSet: { members: partner._id } },
      { session }
    );

    // 3. Update Partner.teamId
    partner.teamId = targetTeam._id;
    await partner.save({ session });

    // 4. Create the PARTNER_TRANSFERRED ManagementAudit record
    await ManagementAudit.create(
      [
        {
          action: 'PARTNER_TRANSFERRED',
          performedBy: {
            id: req.user?.id || req.user?._id,
            name: req.user?.fullName || req.user?.firstName || 'Admin',
            role: req.user?.role || 'ADMIN'
          },
          targetUser: {
            id: partner._id,
            name: partner.fullName,
            partnerId: partner.partnerId,
            role: partner.role || 'PARTNER'
          },
          details: {
            previousTeam: { id: currentTeam._id, name: currentTeam.name, code: currentTeam.code },
            targetTeam: { id: targetTeam._id, name: targetTeam.name, code: targetTeam.code },
            previousManager: currentTeam.managerId,
            targetManager: targetTeam.managerId
          }
        }
      ],
      { session }
    );

    // Commit Transaction
    await session.commitTransaction();

    res.status(200).json({
      statusCode: 200,
      message: `${partner.fullName} successfully transferred to ${targetTeam.name}`,
      data: {
        partnerId: partner._id,
        previousTeamId: currentTeam._id,
        targetTeamId: targetTeam._id
      }
    });
  } catch (err) {
    await session.abortTransaction();
    res.status(500).json({ statusCode: 500, message: err.message });
  } finally {
    await session.endSession();
  }
};

/**
 * 27. TOGGLE TEAM STATUS (ACTIVE / INACTIVE)
 */
exports.toggleTeamStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const callerRole = normalizeRole(req.user?.role);

    const team = await Team.findById(id);
    if (!team) {
      return res.status(404).json({ statusCode: 404, message: 'Team not found' });
    }

    if (callerRole === 'MANAGER') {
      const managerId = req.user.id || req.user._id;
      const manager = await Partner.findById(managerId).select('managerConfig');
      const managedTeams = (manager?.managerConfig?.managedTeams || []).map(t => t.toString());

      if (
        !team.managerId ||
        team.managerId.toString() !== managerId.toString() ||
        !managedTeams.includes(team._id.toString())
      ) {
        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied: Team is outside your management scope'
        });
      }
    }

    const newStatus = team.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    team.status = newStatus;
    await team.save();

    await ManagementAudit.create({
      action: 'TEAM_STATUS_TOGGLED',
      performedBy: {
        id: req.user?.id || req.user?._id,
        name: req.user?.fullName || req.user?.firstName || 'Admin',
        role: req.user?.role || 'ADMIN'
      },
      details: {
        team: { id: team._id, name: team.name, code: team.code },
        newStatus
      }
    });

    res.status(200).json({
      statusCode: 200,
      message: `Team status set to ${newStatus}`,
      data: {
        teamId: team._id,
        status: newStatus
      }
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 28. GET ELIGIBLE PARTNERS FOR A TEAM (For partner picker)
 */
exports.getEligiblePartnersForTeam = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { search = '' } = req.query;

    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ statusCode: 404, message: 'Team not found' });
    }

    const query = {
      role: 'PARTNER',
      isDeleted: false
    };

    if (search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { fullName: regex },
        { partnerId: regex },
        { contactNumber: regex },
        { email: regex }
      ];
    }

    const partners = await Partner.find(query)
      .populate('teamId', 'name code')
      .select('partnerId fullName email contactNumber designation profilePic address averageRating teamId isActive')
      .sort({ createdAt: -1 })
      .limit(100);

    res.status(200).json({
      statusCode: 200,
      message: 'Partners fetched successfully',
      data: partners
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 29. CREATE TEAM (Admin globally; Manager with scope validation)
 */
exports.createTeam = async (req, res) => {
  try {
    const { name, description, categories, areas, managerId, teamLeaderId, members, status } = req.body;
    const callerRole = normalizeRole(req.user?.role);

    if (!name || !name.trim()) {
      return res.status(400).json({ statusCode: 400, message: 'Team name is required' });
    }

    let assignedManagerId = managerId || null;

    if (callerRole === 'MANAGER') {
      const authManagerId = req.user.id || req.user._id;
      assignedManagerId = authManagerId;

      const manager = await Partner.findById(authManagerId).select('managerConfig');
      const managerCats = (manager?.managerConfig?.managedCategories || []).map(c => c.toString());
      const managerHubs = (manager?.managerConfig?.managedAreas || []).map(a => a.toString());

      if (categories && categories.length > 0) {
        const hasUnauthorizedCat = categories.some(c => !managerCats.includes(c.toString()));
        if (hasUnauthorizedCat) {
          return res.status(403).json({
            statusCode: 403,
            message: 'Access denied: You cannot assign categories outside your Manager scope.'
          });
        }
      }

      if (areas && areas.length > 0) {
        const hasUnauthorizedArea = areas.some(a => !managerHubs.includes(a.toString()));
        if (hasUnauthorizedArea) {
          return res.status(403).json({
            statusCode: 403,
            message: 'Access denied: You cannot assign areas outside your Manager scope.'
          });
        }
      }
    }

    const team = new Team({
      name: name.trim(),
      description,
      categories: categories || [],
      areas: areas || [],
      managerId: assignedManagerId,
      teamLeaderId: teamLeaderId || null,
      members: members || [],
      status: status || 'ACTIVE',
      createdBy: req.user?.id || req.user?._id
    });
    await team.save();

    if (assignedManagerId) {
      await Partner.findByIdAndUpdate(assignedManagerId, {
        $addToSet: { 'managerConfig.managedTeams': team._id }
      });
    }

    if (teamLeaderId) {
      await Partner.findByIdAndUpdate(teamLeaderId, {
        'teamLeaderConfig.teamId': team._id,
        ...(assignedManagerId ? { 'teamLeaderConfig.managerId': assignedManagerId } : {})
      });
    }

    if (members && members.length > 0) {
      await Partner.updateMany(
        { _id: { $in: members } },
        { teamId: team._id }
      );
    }

    res.status(201).json({
      statusCode: 201,
      message: 'Team created successfully',
      data: team
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 30. UPDATE TEAM (Admin globally; Manager with scope validation)
 */
exports.updateTeam = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, categories, areas, managerId, teamLeaderId, members, status } = req.body;
    const callerRole = normalizeRole(req.user?.role);

    const existingTeam = await Team.findById(id);
    if (!existingTeam) {
      return res.status(404).json({ statusCode: 404, message: 'Team not found' });
    }

    if (callerRole === 'MANAGER') {
      const authManagerId = req.user.id || req.user._id;
      const manager = await Partner.findById(authManagerId).select('managerConfig');
      const managedTeams = (manager?.managerConfig?.managedTeams || []).map(t => t.toString());
      const managerCats = (manager?.managerConfig?.managedCategories || []).map(c => c.toString());
      const managerHubs = (manager?.managerConfig?.managedAreas || []).map(a => a.toString());

      if (
        !existingTeam.managerId ||
        existingTeam.managerId.toString() !== authManagerId.toString() ||
        !managedTeams.includes(existingTeam._id.toString())
      ) {
        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied: Team is outside your management scope'
        });
      }

      if (managerId && managerId.toString() !== authManagerId.toString()) {
        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied: You cannot reassign team to another Manager.'
        });
      }

      if (categories && categories.length > 0) {
        const hasUnauthorizedCat = categories.some(c => !managerCats.includes(c.toString()));
        if (hasUnauthorizedCat) {
          return res.status(403).json({
            statusCode: 403,
            message: 'Access denied: You cannot assign categories outside your Manager scope.'
          });
        }
      }

      if (areas && areas.length > 0) {
        const hasUnauthorizedArea = areas.some(a => !managerHubs.includes(a.toString()));
        if (hasUnauthorizedArea) {
          return res.status(403).json({
            statusCode: 403,
            message: 'Access denied: You cannot assign areas outside your Manager scope.'
          });
        }
      }
    }

    if (existingTeam.teamLeaderId && existingTeam.teamLeaderId.toString() !== teamLeaderId) {
      await Partner.findByIdAndUpdate(existingTeam.teamLeaderId, {
        'teamLeaderConfig.teamId': null
      });
    }

    if (teamLeaderId) {
      await Partner.findByIdAndUpdate(teamLeaderId, {
        'teamLeaderConfig.teamId': id,
        ...(managerId ? { 'teamLeaderConfig.managerId': managerId } : {})
      });
    }

    if (members) {
      await Partner.updateMany({ teamId: id, _id: { $nin: members } }, { teamId: null });
      await Partner.updateMany({ _id: { $in: members } }, { teamId: id });
    }

    existingTeam.name = name || existingTeam.name;
    existingTeam.description = description !== undefined ? description : existingTeam.description;
    existingTeam.categories = categories || existingTeam.categories;
    existingTeam.areas = areas || existingTeam.areas;
    if (callerRole !== 'MANAGER') {
      existingTeam.managerId = managerId !== undefined ? managerId : existingTeam.managerId;
    }
    existingTeam.teamLeaderId = teamLeaderId !== undefined ? teamLeaderId : existingTeam.teamLeaderId;
    if (members) existingTeam.members = members;
    if (status) existingTeam.status = status;

    await existingTeam.save();

    res.status(200).json({
      statusCode: 200,
      message: 'Team updated successfully',
      data: existingTeam
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

exports.getDashboardSummary = exports.getMyDashboardSummary;

/**
 * 31. AUDIT LOGS
 */
exports.getAuditLogs = async (req, res) => {
  try {
    const logs = await ManagementAudit.find()
      .sort({ createdAt: -1 })
      .limit(100);

    res.status(200).json({
      statusCode: 200,
      message: 'Audit logs fetched successfully',
      data: logs
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};


// ==========================================
// PART 6: SERVICE REQUEST / JOB ASSIGNMENT OPERATIONS
// ==========================================

/**
 * 32. MANAGER SCOPED: Get Service Requests / Jobs with Server-side Filtering & Resolved Hierarchy (PART 6)
 */
exports.getManagerRequests = async (req, res) => {
  try {
    const managerId = req.user?.id || req.user?._id;
    const {
      status = 'all',
      teamId,
      teamLeaderId,
      partnerId,
      categoryId,
      areaId,
      search = '',
      scheduledDate,
      isAssigned = 'all',
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const manager = await Partner.findById(managerId)
      .populate('managerConfig.managedCategories', 'serviceName serviceHeading')
      .populate('managerConfig.managedAreas', 'name pincodes');

    if (!manager) {
      return res.status(404).json({ statusCode: 404, message: 'Manager not found' });
    }

    const managedTeamIds = (manager.managerConfig?.managedTeams || []).map(t => t.toString());
    const managedCategories = manager.managerConfig?.managedCategories || [];
    const categoryIds = managedCategories.map(c => c._id.toString());
    const categoryHeadings = managedCategories.flatMap(c => [c.serviceName, c.serviceHeading].filter(Boolean));

    const managedAreas = manager.managerConfig?.managedAreas || [];
    const areaIds = managedAreas.map(a => a._id.toString());
    const hubNames = managedAreas.map(a => a.name);
    const hubPincodes = managedAreas.flatMap(a => a.pincodes || []);

    // Fetch teams belonging to this manager
    const teams = await Team.find({
      managerId,
      _id: { $in: managedTeamIds }
    }).select('_id name code status teamLeaderId categories areas members');

    const teamIds = teams.map(t => t._id.toString());
    const teamMap = new Map();
    teams.forEach(t => teamMap.set(t._id.toString(), t));

    // Fetch team leaders under this manager
    const teamLeaders = await Partner.find({
      role: 'TEAM_LEADER',
      'teamLeaderConfig.managerId': managerId,
      isDeleted: false
    }).select('_id fullName partnerId email contactNumber teamLeaderConfig');

    const leaderMap = new Map();
    teamLeaders.forEach(l => leaderMap.set(l._id.toString(), l));

    // Fetch all partners belonging to manager's teams
    const partners = await Partner.find({
      role: 'PARTNER',
      teamId: { $in: teamIds },
      isDeleted: false
    }).select('_id fullName partnerId email contactNumber designation hub expertise teamId');

    const partnerMap = new Map();
    partners.forEach(p => partnerMap.set(p._id.toString(), p));
    const allScopedPartnerIds = partners.map(p => p._id);

    // Target Partner filtering based on query params
    let candidatePartnerIds = allScopedPartnerIds;

    // Filter by teamId
    if (teamId) {
      if (!teamIds.includes(teamId.toString())) {
        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied: Requested team is outside your management scope'
        });
      }
      const teamPartners = partners.filter(p => p.teamId?.toString() === teamId.toString()).map(p => p._id);
      candidatePartnerIds = candidatePartnerIds.filter(id => teamPartners.some(tp => tp.toString() === id.toString()));
    }

    // Filter by teamLeaderId
    if (teamLeaderId) {
      const leader = leaderMap.get(teamLeaderId.toString());
      if (!leader) {
        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied: Requested Team Leader is outside your management scope'
        });
      }
      const leaderTeamId = leader.teamLeaderConfig?.teamId?.toString();
      const leaderPartners = partners.filter(p => p.teamId?.toString() === leaderTeamId).map(p => p._id);
      candidatePartnerIds = candidatePartnerIds.filter(id => leaderPartners.some(lp => lp.toString() === id.toString()));
    }

    // Filter by partnerId
    if (partnerId) {
      if (!allScopedPartnerIds.some(id => id.toString() === partnerId.toString())) {
        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied: Requested partner is outside your management scope'
        });
      }
      candidatePartnerIds = candidatePartnerIds.filter(id => id.toString() === partnerId.toString());
    }

    // Build unassigned conditions for service requests
    const unassignedScopeConditions = [];
    if (categoryIds.length > 0) {
      unassignedScopeConditions.push({ mainServiceId: { $in: categoryIds } });
    }
    if (categoryHeadings.length > 0) {
      unassignedScopeConditions.push({ serviceName: { $in: categoryHeadings.map(h => new RegExp(h, 'i')) } });
    }
    if (hubPincodes.length > 0) {
      unassignedScopeConditions.push({ 'deliveryAddress.postalCode': { $in: hubPincodes } });
    }
    if (hubNames.length > 0) {
      unassignedScopeConditions.push({ 'deliveryAddress.city': { $in: hubNames.map(n => new RegExp(n, 'i')) } });
    }

    const unassignedMatchBlock = {
      $and: [
        {
          $or: [
            { assignedPartner: null },
            { assignedPartner: { $exists: false } }
          ]
        },
        ...(unassignedScopeConditions.length > 0 ? [{ $or: unassignedScopeConditions }] : [])
      ]
    };

    // Construct primary query
    const baseQuery = {
      status: { $ne: 'addToCart' }
    };

    if (status !== 'all') {
      baseQuery.status = status;
    }

    if (isAssigned === 'assigned') {
      baseQuery.assignedPartner = { $in: candidatePartnerIds };
    } else if (isAssigned === 'unassigned') {
      Object.assign(baseQuery, unassignedMatchBlock);
    } else {
      // 'all' includes both assigned partners within scope AND unassigned requests within scope
      baseQuery.$or = [
        { assignedPartner: { $in: candidatePartnerIds } },
        unassignedMatchBlock
      ];
    }

    // Scheduled Date filtering
    if (scheduledDate) {
      const startOfDay = new Date(scheduledDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(scheduledDate);
      endOfDay.setHours(23, 59, 59, 999);
      baseQuery.scheduledDate = { $gte: startOfDay, $lte: endOfDay };
    }

    // Search query filtering
    if (search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      const searchOr = [
        { orderId: regex },
        { serviceName: regex },
        { 'deliveryAddress.street': regex },
        { 'deliveryAddress.city': regex },
        { 'deliveryAddress.postalCode': regex },
        { 'contactNumber.number': regex }
      ];
      if (baseQuery.$and) {
        baseQuery.$and.push({ $or: searchOr });
      } else {
        baseQuery.$and = [{ $or: searchOr }];
      }
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const sortOption = {};
    sortOption[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const [requests, totalCount] = await Promise.all([
      Cart.find(baseQuery)
        .populate('userId', 'firstName lastName fullName email contactNumber')
        .populate('serviceId', 'serviceName serviceCost description')
        .populate('assignedPartner', 'fullName partnerId email contactNumber profilePic teamId')
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum),
      Cart.countDocuments(baseQuery)
    ]);

    // Enhance requests with resolved hierarchy
    const enhancedRequests = requests.map(reqDoc => {
      const reqObj = reqDoc.toObject();
      let hierarchy = {
        manager: {
          id: manager._id,
          name: manager.fullName,
          partnerId: manager.partnerId
        },
        team: null,
        teamLeader: null,
        partner: null
      };

      if (reqDoc.assignedPartner) {
        const pId = reqDoc.assignedPartner._id.toString();
        const pInfo = partnerMap.get(pId) || reqDoc.assignedPartner;
        hierarchy.partner = {
          id: pInfo._id,
          name: pInfo.fullName,
          partnerId: pInfo.partnerId,
          contactNumber: pInfo.contactNumber
        };

        const tId = pInfo.teamId?.toString();
        if (tId && teamMap.has(tId)) {
          const tInfo = teamMap.get(tId);
          hierarchy.team = {
            id: tInfo._id,
            name: tInfo.name,
            code: tInfo.code,
            status: tInfo.status
          };

          if (tInfo.teamLeaderId) {
            const tlId = tInfo.teamLeaderId.toString();
            if (leaderMap.has(tlId)) {
              const tlInfo = leaderMap.get(tlId);
              hierarchy.teamLeader = {
                id: tlInfo._id,
                name: tlInfo.fullName,
                partnerId: tlInfo.partnerId,
                contactNumber: tlInfo.contactNumber
              };
            }
          }
        }
      }

      reqObj.hierarchy = hierarchy;
      return reqObj;
    });

    res.status(200).json({
      statusCode: 200,
      message: 'Manager service requests fetched successfully',
      data: enhancedRequests,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitNum)
      }
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 33. MANAGER SCOPED: Request Statistics (PART 6)
 */
exports.getManagerRequestStats = async (req, res) => {
  try {
    const managerId = req.user?.id || req.user?._id;
    const manager = await Partner.findById(managerId)
      .populate('managerConfig.managedCategories', 'serviceName serviceHeading')
      .populate('managerConfig.managedAreas', 'name pincodes');

    if (!manager) {
      return res.status(404).json({ statusCode: 404, message: 'Manager not found' });
    }

    const managedTeamIds = (manager.managerConfig?.managedTeams || []).map(t => t.toString());
    const teams = await Team.find({
      managerId,
      _id: { $in: managedTeamIds }
    }).select('_id');
    const teamIds = teams.map(t => t._id);

    const partners = await Partner.find({
      role: 'PARTNER',
      teamId: { $in: teamIds },
      isDeleted: false
    }).select('_id');
    const scopedPartnerIds = partners.map(p => p._id);

    const managedCategories = manager.managerConfig?.managedCategories || [];
    const categoryIds = managedCategories.map(c => c._id.toString());
    const categoryHeadings = managedCategories.flatMap(c => [c.serviceName, c.serviceHeading].filter(Boolean));

    const managedAreas = manager.managerConfig?.managedAreas || [];
    const hubNames = managedAreas.map(a => a.name);
    const hubPincodes = managedAreas.flatMap(a => a.pincodes || []);

    const unassignedScopeConditions = [];
    if (categoryIds.length > 0) unassignedScopeConditions.push({ mainServiceId: { $in: categoryIds } });
    if (categoryHeadings.length > 0) unassignedScopeConditions.push({ serviceName: { $in: categoryHeadings.map(h => new RegExp(h, 'i')) } });
    if (hubPincodes.length > 0) unassignedScopeConditions.push({ 'deliveryAddress.postalCode': { $in: hubPincodes } });
    if (hubNames.length > 0) unassignedScopeConditions.push({ 'deliveryAddress.city': { $in: hubNames.map(n => new RegExp(n, 'i')) } });

    const unassignedQuery = {
      status: { $ne: 'addToCart' },
      $and: [
        {
          $or: [
            { assignedPartner: null },
            { assignedPartner: { $exists: false } }
          ]
        },
        ...(unassignedScopeConditions.length > 0 ? [{ $or: unassignedScopeConditions }] : [])
      ]
    };

    const assignedBaseQuery = {
      status: { $ne: 'addToCart' },
      assignedPartner: { $in: scopedPartnerIds }
    };

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [
      totalAssigned,
      pending,
      assigned,
      inProgress,
      completed,
      cancelled,
      unassigned,
      todayJobs
    ] = await Promise.all([
      Cart.countDocuments(assignedBaseQuery),
      Cart.countDocuments({ ...assignedBaseQuery, status: 'pending' }),
      Cart.countDocuments({ ...assignedBaseQuery, status: 'assigned' }),
      Cart.countDocuments({ ...assignedBaseQuery, status: 'inProgress' }),
      Cart.countDocuments({ ...assignedBaseQuery, status: 'completed' }),
      Cart.countDocuments({ ...assignedBaseQuery, status: 'cancelled' }),
      Cart.countDocuments(unassignedQuery),
      Cart.countDocuments({
        $or: [
          assignedBaseQuery,
          unassignedQuery
        ],
        scheduledDate: { $gte: todayStart, $lte: todayEnd }
      })
    ]);

    res.status(200).json({
      statusCode: 200,
      message: 'Manager request stats fetched successfully',
      data: {
        totalRequests: totalAssigned + unassigned,
        assignedRequests: totalAssigned,
        unassignedRequests: unassigned,
        pendingRequests: pending,
        assignedStatusRequests: assigned,
        inProgressRequests: inProgress,
        completedRequests: completed,
        cancelledRequests: cancelled,
        todayRequests: todayJobs
      }
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 34. MANAGER SCOPED: Get Single Request Detail with Verification (PART 6)
 */
exports.getManagerRequestById = async (req, res) => {
  try {
    const managerId = req.user?.id || req.user?._id;
    const { id } = req.params;

    const request = await Cart.findById(id)
      .populate('userId', 'firstName lastName fullName email contactNumber profilePic address')
      .populate('serviceId', 'serviceName serviceCost description serviceImage')
      .populate('assignedPartner', 'fullName partnerId email contactNumber profilePic teamId expertise rating hub');

    if (!request) {
      return res.status(404).json({ statusCode: 404, message: 'Service request not found' });
    }

    const manager = await Partner.findById(managerId)
      .populate('managerConfig.managedCategories', 'serviceName serviceHeading')
      .populate('managerConfig.managedAreas', 'name pincodes');

    const managedTeamIds = (manager?.managerConfig?.managedTeams || []).map(t => t.toString());

    // Validate scope
    let inScope = false;
    let resolvedTeam = null;
    let resolvedLeader = null;

    if (request.assignedPartner) {
      const partner = await Partner.findById(request.assignedPartner._id || request.assignedPartner);
      if (partner?.teamId) {
        const team = await Team.findById(partner.teamId);
        if (team && team.managerId?.toString() === managerId.toString() && managedTeamIds.includes(team._id.toString())) {
          inScope = true;
          resolvedTeam = team;
          if (team.teamLeaderId) {
            resolvedLeader = await Partner.findById(team.teamLeaderId).select('partnerId fullName email contactNumber');
          }
        }
      }
    } else {
      // Check unassigned matching
      const managedCategories = manager.managerConfig?.managedCategories || [];
      const categoryIds = managedCategories.map(c => c._id.toString());
      const categoryHeadings = managedCategories.flatMap(c => [c.serviceName, c.serviceHeading].filter(Boolean));

      const managedAreas = manager.managerConfig?.managedAreas || [];
      const hubNames = managedAreas.map(a => a.name);
      const hubPincodes = managedAreas.flatMap(a => a.pincodes || []);

      const matchesCat = (request.mainServiceId && categoryIds.includes(request.mainServiceId.toString())) ||
                         (categoryHeadings.some(h => new RegExp(h, 'i').test(request.serviceName)));
      const matchesArea = (request.deliveryAddress?.postalCode && hubPincodes.includes(request.deliveryAddress.postalCode)) ||
                          (request.deliveryAddress?.city && hubNames.some(n => new RegExp(n, 'i').test(request.deliveryAddress.city)));

      if (matchesCat || matchesArea) {
        inScope = true;
      }
    }

    if (!inScope && normalizeRole(req.user?.role) !== 'ADMIN' && normalizeRole(req.user?.role) !== 'SUBADMIN') {
      return res.status(403).json({
        statusCode: 403,
        message: 'Access denied: Service request is outside your operational scope'
      });
    }

    const reqObj = request.toObject();
    reqObj.hierarchy = {
      manager: {
        id: manager._id,
        name: manager.fullName,
        partnerId: manager.partnerId
      },
      team: resolvedTeam ? { id: resolvedTeam._id, name: resolvedTeam.name, code: resolvedTeam.code } : null,
      teamLeader: resolvedLeader ? { id: resolvedLeader._id, name: resolvedLeader.fullName, partnerId: resolvedLeader.partnerId } : null,
      partner: request.assignedPartner ? {
        id: request.assignedPartner._id,
        name: request.assignedPartner.fullName,
        partnerId: request.assignedPartner.partnerId,
        contactNumber: request.assignedPartner.contactNumber
      } : null
    };

    res.status(200).json({
      statusCode: 200,
      message: 'Service request details fetched successfully',
      data: reqObj
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 35. TEAM LEADER SCOPED: Get Squad Service Requests / Jobs (PART 6)
 */
exports.getTeamLeaderRequests = async (req, res) => {
  try {
    const leaderId = req.user?.id || req.user?._id;
    const {
      status = 'all',
      partnerId,
      scheduledDate,
      search = '',
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const leader = await Partner.findById(leaderId);
    if (!leader || leader.teamLeaderConfig?.status !== 'ACTIVE') {
      return res.status(403).json({
        statusCode: 403,
        message: 'Access denied: Team Leader account is inactive or not found'
      });
    }

    const teamId = leader.teamLeaderConfig?.teamId;
    if (!teamId) {
      return res.status(403).json({
        statusCode: 403,
        message: 'Access denied: You are not currently assigned to an active team'
      });
    }

    const team = await Team.findById(teamId).select('name code managerId');
    const partners = await Partner.find({
      role: 'PARTNER',
      teamId,
      isDeleted: false
    }).select('_id fullName partnerId email contactNumber designation');

    const partnerIds = partners.map(p => p._id);
    const partnerMap = new Map();
    partners.forEach(p => partnerMap.set(p._id.toString(), p));

    // Scope query strictly to squad partners
    let targetPartnerFilter = { $in: partnerIds };
    if (partnerId) {
      if (!partnerIds.some(id => id.toString() === partnerId.toString())) {
        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied: Requested partner is not a member of your squad'
        });
      }
      targetPartnerFilter = partnerId;
    }

    const query = {
      status: { $ne: 'addToCart' },
      assignedPartner: targetPartnerFilter
    };

    if (status !== 'all') {
      query.status = status;
    }

    if (scheduledDate) {
      const startOfDay = new Date(scheduledDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(scheduledDate);
      endOfDay.setHours(23, 59, 59, 999);
      query.scheduledDate = { $gte: startOfDay, $lte: endOfDay };
    }

    if (search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { orderId: regex },
        { serviceName: regex },
        { 'deliveryAddress.street': regex },
        { 'deliveryAddress.city': regex },
        { 'contactNumber.number': regex }
      ];
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const sortOption = {};
    sortOption[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const [requests, totalCount, pendingCount, inProgressCount, completedCount] = await Promise.all([
      Cart.find(query)
        .populate('userId', 'firstName lastName fullName email contactNumber')
        .populate('serviceId', 'serviceName serviceCost')
        .populate('assignedPartner', 'fullName partnerId email contactNumber profilePic')
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum),
      Cart.countDocuments(query),
      Cart.countDocuments({ assignedPartner: { $in: partnerIds }, status: 'pending' }),
      Cart.countDocuments({ assignedPartner: { $in: partnerIds }, status: 'inProgress' }),
      Cart.countDocuments({ assignedPartner: { $in: partnerIds }, status: 'completed' })
    ]);

    const enhanced = requests.map(reqDoc => {
      const obj = reqDoc.toObject();
      obj.hierarchy = {
        team: { id: team._id, name: team.name, code: team.code },
        teamLeader: { id: leader._id, name: leader.fullName, partnerId: leader.partnerId },
        partner: obj.assignedPartner ? {
          id: obj.assignedPartner._id,
          name: obj.assignedPartner.fullName,
          partnerId: obj.assignedPartner.partnerId
        } : null
      };
      return obj;
    });

    res.status(200).json({
      statusCode: 200,
      message: 'Team squad service requests fetched successfully',
      data: enhanced,
      stats: {
        total: totalCount,
        pending: pendingCount,
        inProgress: inProgressCount,
        completed: completedCount
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitNum)
      }
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 36. TEAM LEADER SCOPED: Get Single Squad Request Detail (PART 6)
 */
exports.getTeamLeaderRequestById = async (req, res) => {
  try {
    const leaderId = req.user?.id || req.user?._id;
    const { id } = req.params;

    const leader = await Partner.findById(leaderId);
    const teamId = leader?.teamLeaderConfig?.teamId;
    if (!teamId) {
      return res.status(403).json({ statusCode: 403, message: 'Access denied: No active team assignment' });
    }

    const request = await Cart.findById(id)
      .populate('userId', 'firstName lastName fullName email contactNumber profilePic address')
      .populate('serviceId', 'serviceName serviceCost description serviceImage')
      .populate('assignedPartner', 'fullName partnerId email contactNumber profilePic teamId');

    if (!request) {
      return res.status(404).json({ statusCode: 404, message: 'Service request not found' });
    }

    if (!request.assignedPartner) {
      return res.status(403).json({
        statusCode: 403,
        message: 'Access denied: Unassigned requests can only be accessed by Managers or Admins'
      });
    }

    const partner = await Partner.findById(request.assignedPartner._id || request.assignedPartner);
    if (!partner || !partner.teamId || partner.teamId.toString() !== teamId.toString()) {
      return res.status(403).json({
        statusCode: 403,
        message: 'Access denied: This request is not assigned to a member of your squad'
      });
    }

    res.status(200).json({
      statusCode: 200,
      message: 'Squad service request fetched successfully',
      data: request
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 37. ASSIGN SERVICE REQUEST / JOB (PART 6)
 * Strictly validates 409 Conflict if already assigned.
 * Uses atomic MongoDB transaction/session.
 */
exports.assignJob = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { requestId } = req.params;
    const { partnerId, scheduledDate, notes } = req.body;
    const callerRole = normalizeRole(req.user?.role);
    const callerId = req.user?.id || req.user?._id;

    if (!partnerId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ statusCode: 400, message: 'Target partnerId is required' });
    }

    // 1. Request existence check
    const request = await Cart.findById(requestId).session(session);
    if (!request) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ statusCode: 404, message: 'Service request not found' });
    }

    // 2. Request assignability check
    if (['completed', 'cancelled'].includes(request.status)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        statusCode: 400,
        message: `Cannot assign: Service request is already ${request.status}.`
      });
    }

    // 3. REASSIGNMENT SAFETY: 409 Conflict check if already assigned
    if (request.assignedPartner) {
      const currentPartner = await Partner.findById(request.assignedPartner).select('partnerId fullName email contactNumber');
      await session.abortTransaction();
      session.endSession();
      return res.status(409).json({
        statusCode: 409,
        conflict: true,
        message: 'This service request is already assigned to a Partner. Use the explicit Reassign action to replace the assignment.',
        currentPartner: currentPartner ? {
          _id: currentPartner._id,
          partnerId: currentPartner.partnerId,
          fullName: currentPartner.fullName
        } : null
      });
    }

    // 4. Target partner validation
    const targetPartner = await Partner.findOne({ _id: partnerId, isDeleted: false }).session(session);
    if (!targetPartner) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ statusCode: 404, message: 'Target partner not found' });
    }

    if (!targetPartner.isActive) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ statusCode: 400, message: 'Cannot assign: Target partner account is inactive.' });
    }

    if (normalizeRole(targetPartner.role) !== 'PARTNER') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ statusCode: 400, message: 'Cannot assign: Target user is not an operational partner.' });
    }

    if (!targetPartner.teamId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ statusCode: 400, message: 'Cannot assign: Target partner is not assigned to any team.' });
    }

    // 5. Manager Scope Verification
    const targetTeam = await Team.findById(targetPartner.teamId).session(session);
    if (!targetTeam) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ statusCode: 404, message: 'Target team not found' });
    }

    if (callerRole === 'MANAGER') {
      const manager = await Partner.findById(callerId).select('managerConfig').session(session);
      const managedTeams = (manager?.managerConfig?.managedTeams || []).map(t => t.toString());

      if (
        !targetTeam.managerId ||
        targetTeam.managerId.toString() !== callerId.toString() ||
        !managedTeams.includes(targetTeam._id.toString())
      ) {
        await session.abortTransaction();
        session.endSession();
        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied: Target partner belongs to a team outside your management scope'
        });
      }
    }

    if (targetTeam.status !== 'ACTIVE') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        statusCode: 400,
        message: 'Cannot assign: Target team is currently INACTIVE.'
      });
    }

    // 6. Update Assignment & Tracking
    const newStatus = (request.status === 'addToCart' || request.status === 'pending') ? 'assigned' : request.status;
    const trackingMsg = notes
      ? `Task assigned to ${targetPartner.fullName} (${targetTeam.name}). Note: ${notes}`
      : `Task assigned to ${targetPartner.fullName} (${targetTeam.name})`;

    const updateFields = {
      assignedPartner: targetPartner._id,
      status: newStatus
    };

    if (scheduledDate) {
      updateFields.scheduledDate = new Date(scheduledDate);
    }

    const updatedRequest = await Cart.findByIdAndUpdate(
      requestId,
      {
        $set: updateFields,
        $push: {
          tracking: {
            message: trackingMsg,
            status: newStatus,
            date: new Date()
          }
        }
      },
      { new: true, session }
    );

    // 7. Audit Logging inside transaction
    await ManagementAudit.create([
      {
        action: 'JOB_ASSIGNED',
        performedBy: {
          id: callerId,
          name: req.user?.fullName || req.user?.firstName || 'Manager',
          role: callerRole
        },
        targetUser: {
          id: targetPartner._id,
          name: targetPartner.fullName,
          partnerId: targetPartner.partnerId,
          role: targetPartner.role
        },
        details: {
          requestId: request._id,
          orderId: request.orderId,
          serviceName: request.serviceName,
          team: { id: targetTeam._id, name: targetTeam.name, code: targetTeam.code },
          scheduledDate: updateFields.scheduledDate || request.scheduledDate,
          notes: notes || ''
        }
      }
    ], { session });

    await session.commitTransaction();
    session.endSession();

    // 8. Real-time Notification
    try {
      if (ably?.channels) {
        ably.channels.get(`partner-${targetPartner._id}`).publish('task_assigned', {
          message: 'A new task has been assigned to you',
          taskId: updatedRequest._id,
          orderId: updatedRequest.orderId
        });
        ably.channels.get('admin-channel').publish('task_updated', {
          message: `Task ${updatedRequest.orderId || updatedRequest._id} assigned to ${targetPartner.fullName}`,
          taskId: updatedRequest._id
        });
      }
    } catch (e) {
      console.warn('Real-time notify warning:', e.message);
    }

    res.status(200).json({
      statusCode: 200,
      message: `Service request successfully assigned to ${targetPartner.fullName}`,
      data: {
        requestId: updatedRequest._id,
        orderId: updatedRequest.orderId,
        assignedPartner: {
          _id: targetPartner._id,
          fullName: targetPartner.fullName,
          partnerId: targetPartner.partnerId
        },
        team: {
          _id: targetTeam._id,
          name: targetTeam.name
        },
        status: updatedRequest.status
      }
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 38. EXPLICIT JOB REASSIGNMENT (PART 6)
 * Reassigns an actively assigned job from Source Partner to Target Partner.
 * Validates cross-manager protection and uses atomic MongoDB transaction.
 */
exports.reassignJob = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { requestId } = req.params;
    const { partnerId, reason = '', scheduledDate } = req.body;
    const callerRole = normalizeRole(req.user?.role);
    const callerId = req.user?.id || req.user?._id;

    if (!partnerId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ statusCode: 400, message: 'Target partnerId is required' });
    }

    // 1. Request existence check
    const request = await Cart.findById(requestId).session(session);
    if (!request) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ statusCode: 404, message: 'Service request not found' });
    }

    // 2. Assignability check
    if (['completed', 'cancelled'].includes(request.status)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        statusCode: 400,
        message: `Cannot reassign: Service request is already ${request.status}.`
      });
    }

    // 3. Must have active source assignment
    if (!request.assignedPartner) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        statusCode: 400,
        message: 'This request is not currently assigned to any partner. Use the standard Assign action.'
      });
    }

    // 4. Cannot reassign to the exact same partner
    if (request.assignedPartner.toString() === partnerId.toString()) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        statusCode: 400,
        message: 'Cannot reassign: Target partner is already the assigned partner for this job.'
      });
    }

    // 5. Source Partner Validation
    const sourcePartner = await Partner.findById(request.assignedPartner).session(session);
    if (!sourcePartner) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ statusCode: 404, message: 'Current assigned partner not found' });
    }

    // 6. Target Partner Validation
    const targetPartner = await Partner.findOne({ _id: partnerId, isDeleted: false }).session(session);
    if (!targetPartner) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ statusCode: 404, message: 'Target partner not found' });
    }

    if (!targetPartner.isActive) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ statusCode: 400, message: 'Cannot reassign: Target partner account is inactive.' });
    }

    if (!targetPartner.teamId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ statusCode: 400, message: 'Cannot reassign: Target partner is not assigned to any team.' });
    }

    const sourceTeam = sourcePartner.teamId ? await Team.findById(sourcePartner.teamId).session(session) : null;
    const targetTeam = await Team.findById(targetPartner.teamId).session(session);
    if (!targetTeam) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ statusCode: 404, message: 'Target team not found' });
    }

    // 7. CROSS-MANAGER REASSIGNMENT PROTECTION
    if (callerRole === 'MANAGER') {
      const manager = await Partner.findById(callerId).select('managerConfig').session(session);
      const managedTeams = (manager?.managerConfig?.managedTeams || []).map(t => t.toString());

      // Source check: source team must belong to this manager
      if (sourceTeam) {
        if (
          !sourceTeam.managerId ||
          sourceTeam.managerId.toString() !== callerId.toString() ||
          !managedTeams.includes(sourceTeam._id.toString())
        ) {
          await session.abortTransaction();
          session.endSession();
          return res.status(403).json({
            statusCode: 403,
            message: 'Access denied: Current assigned partner belongs to a team outside your management scope'
          });
        }
      }

      // Target check: target team must belong to this manager
      if (
        !targetTeam.managerId ||
        targetTeam.managerId.toString() !== callerId.toString() ||
        !managedTeams.includes(targetTeam._id.toString())
      ) {
        await session.abortTransaction();
        session.endSession();
        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied: Target partner belongs to a team outside your management scope'
        });
      }
    }

    if (targetTeam.status !== 'ACTIVE') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        statusCode: 400,
        message: 'Cannot reassign: Target team is currently INACTIVE.'
      });
    }

    // 8. Update Assignment & Tracking
    const trackingMsg = reason
      ? `Task reassigned from ${sourcePartner.fullName} to ${targetPartner.fullName}. Reason: ${reason}`
      : `Task reassigned from ${sourcePartner.fullName} to ${targetPartner.fullName}`;

    const updateFields = {
      assignedPartner: targetPartner._id
    };
    if (scheduledDate) {
      updateFields.scheduledDate = new Date(scheduledDate);
    }

    const updatedRequest = await Cart.findByIdAndUpdate(
      requestId,
      {
        $set: updateFields,
        $push: {
          tracking: {
            message: trackingMsg,
            status: request.status,
            date: new Date()
          }
        }
      },
      { new: true, session }
    );

    // 9. Audit Logging inside transaction
    await ManagementAudit.create([
      {
        action: 'JOB_REASSIGNED',
        performedBy: {
          id: callerId,
          name: req.user?.fullName || req.user?.firstName || 'Manager',
          role: callerRole
        },
        targetUser: {
          id: targetPartner._id,
          name: targetPartner.fullName,
          partnerId: targetPartner.partnerId,
          role: targetPartner.role
        },
        details: {
          requestId: request._id,
          orderId: request.orderId,
          serviceName: request.serviceName,
          previousPartner: {
            id: sourcePartner._id,
            name: sourcePartner.fullName,
            partnerId: sourcePartner.partnerId,
            team: sourceTeam ? { id: sourceTeam._id, name: sourceTeam.name } : null
          },
          newPartner: {
            id: targetPartner._id,
            name: targetPartner.fullName,
            partnerId: targetPartner.partnerId,
            team: { id: targetTeam._id, name: targetTeam.name }
          },
          reason: reason || 'Explicit reassignment'
        }
      }
    ], { session });

    await session.commitTransaction();
    session.endSession();

    // 10. Real-time Notifications
    try {
      if (ably?.channels) {
        ably.channels.get(`partner-${sourcePartner._id}`).publish('task_unassigned', {
          message: `Task ${updatedRequest.orderId || updatedRequest._id} has been reassigned to another partner`,
          taskId: updatedRequest._id
        });
        ably.channels.get(`partner-${targetPartner._id}`).publish('task_assigned', {
          message: 'A new task has been reassigned to you',
          taskId: updatedRequest._id,
          orderId: updatedRequest.orderId
        });
        ably.channels.get('admin-channel').publish('task_updated', {
          message: `Task ${updatedRequest.orderId || updatedRequest._id} reassigned from ${sourcePartner.fullName} to ${targetPartner.fullName}`,
          taskId: updatedRequest._id
        });
      }
    } catch (e) {
      console.warn('Real-time notification warning:', e.message);
    }

    res.status(200).json({
      statusCode: 200,
      message: `Service request successfully reassigned to ${targetPartner.fullName}`,
      data: {
        requestId: updatedRequest._id,
        orderId: updatedRequest.orderId,
        previousPartner: {
          _id: sourcePartner._id,
          fullName: sourcePartner.fullName,
          partnerId: sourcePartner.partnerId
        },
        newPartner: {
          _id: targetPartner._id,
          fullName: targetPartner.fullName,
          partnerId: targetPartner.partnerId
        },
        team: {
          _id: targetTeam._id,
          name: targetTeam.name
        }
      }
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 39. SCOPED JOB STATUS UPDATE (PART 6)
 */
exports.updateJobStatus = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status, trackingMessage } = req.body;
    const callerRole = normalizeRole(req.user?.role);
    const callerId = req.user?.id || req.user?._id;

    if (!status) {
      return res.status(400).json({ statusCode: 400, message: 'Status is required' });
    }

    const validStatuses = ['pending', 'assigned', 'inProgress', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ statusCode: 400, message: `Invalid status '${status}'. Valid: ${validStatuses.join(', ')}` });
    }

    const request = await Cart.findById(requestId);
    if (!request) {
      return res.status(404).json({ statusCode: 404, message: 'Service request not found' });
    }

    // Lifecycle transition protection: Cannot revive completed or cancelled jobs
    if (['completed', 'cancelled'].includes(request.status) && request.status !== status) {
      return res.status(400).json({
        statusCode: 400,
        message: `Cannot transition job: Current status is already '${request.status}' and cannot be modified.`
      });
    }

    // Scope check for Manager and Team Leader
    if (callerRole === 'MANAGER') {
      const manager = await Partner.findById(callerId).select('managerConfig');
      const managedTeams = (manager?.managerConfig?.managedTeams || []).map(t => t.toString());

      if (request.assignedPartner) {
        const partner = await Partner.findById(request.assignedPartner);
        const team = partner?.teamId ? await Team.findById(partner.teamId) : null;
        if (!team || team.managerId?.toString() !== callerId.toString() || !managedTeams.includes(team._id.toString())) {
          return res.status(403).json({
            statusCode: 403,
            message: 'Access denied: This request is outside your management scope'
          });
        }
      }
    } else if (callerRole === 'TEAM_LEADER') {
      const leader = await Partner.findById(callerId);
      const teamId = leader?.teamLeaderConfig?.teamId;

      if (!request.assignedPartner) {
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Squad leader cannot manage unassigned jobs' });
      }

      const partner = await Partner.findById(request.assignedPartner);
      if (!partner?.teamId || partner.teamId.toString() !== teamId?.toString()) {
        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied: This request is not assigned to a member of your squad'
        });
      }
    }

    const prevStatus = request.status;
    request.status = status;
    const msg = trackingMessage || `Status updated from ${prevStatus} to ${status}`;

    request.tracking.push({
      message: msg,
      status,
      date: new Date()
    });

    if (status === 'completed') {
      request.completedAt = new Date();
    }

    await request.save();

    await ManagementAudit.create({
      action: 'JOB_STATUS_UPDATED',
      performedBy: {
        id: callerId,
        name: req.user?.fullName || req.user?.firstName || 'User',
        role: callerRole
      },
      details: {
        requestId: request._id,
        orderId: request.orderId,
        previousStatus: prevStatus,
        newStatus: status,
        message: msg
      }
    });

    res.status(200).json({
      statusCode: 200,
      message: `Service request status updated to ${status}`,
      data: {
        requestId: request._id,
        status: request.status,
        completedAt: request.completedAt
      }
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};


// ==========================================
// PART 6: SERVICE REQUEST / JOB ASSIGNMENT OPERATIONS
// ==========================================

/**
 * 32. MANAGER SCOPED: Get Service Requests / Jobs with Server-side Filtering & Resolved Hierarchy (PART 6)
 */
exports.getManagerRequests = async (req, res) => {
  try {
    const managerId = req.user?.id || req.user?._id;
    const {
      status = 'all',
      teamId,
      teamLeaderId,
      partnerId,
      categoryId,
      areaId,
      search = '',
      scheduledDate,
      isAssigned = 'all',
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const manager = await Partner.findById(managerId)
      .populate('managerConfig.managedCategories', 'serviceName serviceHeading')
      .populate('managerConfig.managedAreas', 'name pincodes');

    if (!manager) {
      return res.status(404).json({ statusCode: 404, message: 'Manager not found' });
    }

    const managedTeamIds = (manager.managerConfig?.managedTeams || []).map(t => t.toString());
    const managedCategories = manager.managerConfig?.managedCategories || [];
    const categoryIds = managedCategories.map(c => c._id.toString());
    const categoryHeadings = managedCategories.flatMap(c => [c.serviceName, c.serviceHeading].filter(Boolean));

    const managedAreas = manager.managerConfig?.managedAreas || [];
    const areaIds = managedAreas.map(a => a._id.toString());
    const hubNames = managedAreas.map(a => a.name);
    const hubPincodes = managedAreas.flatMap(a => a.pincodes || []);

    // Fetch teams belonging to this manager
    const teams = await Team.find({
      managerId,
      _id: { $in: managedTeamIds }
    }).select('_id name code status teamLeaderId categories areas members');

    const teamIds = teams.map(t => t._id.toString());
    const teamMap = new Map();
    teams.forEach(t => teamMap.set(t._id.toString(), t));

    if (teamId && !teamIds.includes(teamId.toString())) {
      return res.status(403).json({
        statusCode: 403,
        message: 'Access denied: Requested team is outside your management scope'
      });
    }

    // Fetch team leaders under this manager
    const teamLeaders = await Partner.find({
      role: 'TEAM_LEADER',
      'teamLeaderConfig.managerId': managerId,
      isDeleted: false
    }).select('_id fullName partnerId email contactNumber teamLeaderConfig');

    const leaderMap = new Map();
    teamLeaders.forEach(l => leaderMap.set(l._id.toString(), l));

    // Fetch all partners belonging to manager's teams
    const partners = await Partner.find({
      role: 'PARTNER',
      teamId: { $in: teamIds },
      isDeleted: false
    }).select('_id fullName partnerId email contactNumber designation hub expertise teamId');

    const partnerMap = new Map();
    partners.forEach(p => partnerMap.set(p._id.toString(), p));
    const allScopedPartnerIds = partners.map(p => p._id);

    // Target Partner filtering based on query params
    let candidatePartnerIds = allScopedPartnerIds;

    // Filter by teamId
    if (teamId) {
      if (!teamIds.includes(teamId.toString())) {
        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied: Requested team is outside your management scope'
        });
      }
      const teamPartners = partners.filter(p => p.teamId?.toString() === teamId.toString()).map(p => p._id);
      candidatePartnerIds = candidatePartnerIds.filter(id => teamPartners.some(tp => tp.toString() === id.toString()));
    }

    // Filter by teamLeaderId
    if (teamLeaderId) {
      const leader = leaderMap.get(teamLeaderId.toString());
      if (!leader) {
        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied: Requested Team Leader is outside your management scope'
        });
      }
      const leaderTeamId = leader.teamLeaderConfig?.teamId?.toString();
      const leaderPartners = partners.filter(p => p.teamId?.toString() === leaderTeamId).map(p => p._id);
      candidatePartnerIds = candidatePartnerIds.filter(id => leaderPartners.some(lp => lp.toString() === id.toString()));
    }

    // Filter by partnerId
    if (partnerId) {
      if (!allScopedPartnerIds.some(id => id.toString() === partnerId.toString())) {
        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied: Requested partner is outside your management scope'
        });
      }
      candidatePartnerIds = candidatePartnerIds.filter(id => id.toString() === partnerId.toString());
    }

    // Build unassigned conditions for service requests
    const unassignedScopeConditions = [];
    if (categoryIds.length > 0) {
      unassignedScopeConditions.push({ mainServiceId: { $in: categoryIds } });
    }
    if (categoryHeadings.length > 0) {
      unassignedScopeConditions.push({ serviceName: { $in: categoryHeadings.map(h => new RegExp(h, 'i')) } });
    }
    if (hubPincodes.length > 0) {
      unassignedScopeConditions.push({ 'deliveryAddress.postalCode': { $in: hubPincodes } });
    }
    if (hubNames.length > 0) {
      unassignedScopeConditions.push({ 'deliveryAddress.city': { $in: hubNames.map(n => new RegExp(n, 'i')) } });
    }

    const unassignedMatchBlock = {
      $and: [
        {
          $or: [
            { assignedPartner: null },
            { assignedPartner: { $exists: false } }
          ]
        },
        ...(unassignedScopeConditions.length > 0 ? [{ $or: unassignedScopeConditions }] : [])
      ]
    };

    // Construct primary query
    const baseQuery = {
      status: { $ne: 'addToCart' }
    };

    if (status !== 'all') {
      baseQuery.status = status;
    }

    if (isAssigned === 'assigned') {
      baseQuery.assignedPartner = { $in: candidatePartnerIds };
    } else if (isAssigned === 'unassigned') {
      Object.assign(baseQuery, unassignedMatchBlock);
    } else {
      // 'all' includes both assigned partners within scope AND unassigned requests within scope
      baseQuery.$or = [
        { assignedPartner: { $in: candidatePartnerIds } },
        unassignedMatchBlock
      ];
    }

    // Scheduled Date filtering
    if (scheduledDate) {
      const startOfDay = new Date(scheduledDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(scheduledDate);
      endOfDay.setHours(23, 59, 59, 999);
      baseQuery.scheduledDate = { $gte: startOfDay, $lte: endOfDay };
    }

    // Search query filtering
    if (search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      const searchOr = [
        { orderId: regex },
        { serviceName: regex },
        { 'deliveryAddress.street': regex },
        { 'deliveryAddress.city': regex },
        { 'deliveryAddress.postalCode': regex },
        { 'contactNumber.number': regex }
      ];
      if (baseQuery.$and) {
        baseQuery.$and.push({ $or: searchOr });
      } else {
        baseQuery.$and = [{ $or: searchOr }];
      }
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const sortOption = {};
    sortOption[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const [requests, totalCount] = await Promise.all([
      Cart.find(baseQuery)
        .populate('userId', 'firstName lastName fullName email contactNumber')
        .populate('serviceId', 'serviceName serviceCost description')
        .populate('assignedPartner', 'fullName partnerId email contactNumber profilePic teamId')
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum),
      Cart.countDocuments(baseQuery)
    ]);

    // Enhance requests with resolved hierarchy
    const enhancedRequests = requests.map(reqDoc => {
      const reqObj = reqDoc.toObject();
      let hierarchy = {
        manager: {
          id: manager._id,
          name: manager.fullName,
          partnerId: manager.partnerId
        },
        team: null,
        teamLeader: null,
        partner: null
      };

      if (reqDoc.assignedPartner) {
        const pId = reqDoc.assignedPartner._id.toString();
        const pInfo = partnerMap.get(pId) || reqDoc.assignedPartner;
        hierarchy.partner = {
          id: pInfo._id,
          name: pInfo.fullName,
          partnerId: pInfo.partnerId,
          contactNumber: pInfo.contactNumber
        };

        const tId = pInfo.teamId?.toString();
        if (tId && teamMap.has(tId)) {
          const tInfo = teamMap.get(tId);
          hierarchy.team = {
            id: tInfo._id,
            name: tInfo.name,
            code: tInfo.code,
            status: tInfo.status
          };

          if (tInfo.teamLeaderId) {
            const tlId = tInfo.teamLeaderId.toString();
            if (leaderMap.has(tlId)) {
              const tlInfo = leaderMap.get(tlId);
              hierarchy.teamLeader = {
                id: tlInfo._id,
                name: tlInfo.fullName,
                partnerId: tlInfo.partnerId,
                contactNumber: tlInfo.contactNumber
              };
            }
          }
        }
      }

      reqObj.hierarchy = hierarchy;
      return reqObj;
    });

    res.status(200).json({
      statusCode: 200,
      message: 'Manager service requests fetched successfully',
      data: enhancedRequests,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitNum)
      }
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 33. MANAGER SCOPED: Request Statistics (PART 6)
 */
exports.getManagerRequestStats = async (req, res) => {
  try {
    const managerId = req.user?.id || req.user?._id;
    const manager = await Partner.findById(managerId)
      .populate('managerConfig.managedCategories', 'serviceName serviceHeading')
      .populate('managerConfig.managedAreas', 'name pincodes');

    if (!manager) {
      return res.status(404).json({ statusCode: 404, message: 'Manager not found' });
    }

    const managedTeamIds = (manager.managerConfig?.managedTeams || []).map(t => t.toString());
    const teams = await Team.find({
      managerId,
      _id: { $in: managedTeamIds }
    }).select('_id');
    const teamIds = teams.map(t => t._id);

    const partners = await Partner.find({
      role: 'PARTNER',
      teamId: { $in: teamIds },
      isDeleted: false
    }).select('_id');
    const scopedPartnerIds = partners.map(p => p._id);

    const managedCategories = manager.managerConfig?.managedCategories || [];
    const categoryIds = managedCategories.map(c => c._id.toString());
    const categoryHeadings = managedCategories.flatMap(c => [c.serviceName, c.serviceHeading].filter(Boolean));

    const managedAreas = manager.managerConfig?.managedAreas || [];
    const hubNames = managedAreas.map(a => a.name);
    const hubPincodes = managedAreas.flatMap(a => a.pincodes || []);

    const unassignedScopeConditions = [];
    if (categoryIds.length > 0) unassignedScopeConditions.push({ mainServiceId: { $in: categoryIds } });
    if (categoryHeadings.length > 0) unassignedScopeConditions.push({ serviceName: { $in: categoryHeadings.map(h => new RegExp(h, 'i')) } });
    if (hubPincodes.length > 0) unassignedScopeConditions.push({ 'deliveryAddress.postalCode': { $in: hubPincodes } });
    if (hubNames.length > 0) unassignedScopeConditions.push({ 'deliveryAddress.city': { $in: hubNames.map(n => new RegExp(n, 'i')) } });

    const unassignedQuery = {
      status: { $ne: 'addToCart' },
      $and: [
        {
          $or: [
            { assignedPartner: null },
            { assignedPartner: { $exists: false } }
          ]
        },
        ...(unassignedScopeConditions.length > 0 ? [{ $or: unassignedScopeConditions }] : [])
      ]
    };

    const assignedBaseQuery = {
      status: { $ne: 'addToCart' },
      assignedPartner: { $in: scopedPartnerIds }
    };

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [
      totalAssigned,
      pending,
      assigned,
      inProgress,
      completed,
      cancelled,
      unassigned,
      todayJobs
    ] = await Promise.all([
      Cart.countDocuments(assignedBaseQuery),
      Cart.countDocuments({ ...assignedBaseQuery, status: 'pending' }),
      Cart.countDocuments({ ...assignedBaseQuery, status: 'assigned' }),
      Cart.countDocuments({ ...assignedBaseQuery, status: 'inProgress' }),
      Cart.countDocuments({ ...assignedBaseQuery, status: 'completed' }),
      Cart.countDocuments({ ...assignedBaseQuery, status: 'cancelled' }),
      Cart.countDocuments(unassignedQuery),
      Cart.countDocuments({
        $or: [
          assignedBaseQuery,
          unassignedQuery
        ],
        scheduledDate: { $gte: todayStart, $lte: todayEnd }
      })
    ]);

    res.status(200).json({
      statusCode: 200,
      message: 'Manager request stats fetched successfully',
      data: {
        totalRequests: totalAssigned + unassigned,
        assignedRequests: totalAssigned,
        unassignedRequests: unassigned,
        pendingRequests: pending,
        assignedStatusRequests: assigned,
        inProgressRequests: inProgress,
        completedRequests: completed,
        cancelledRequests: cancelled,
        todayRequests: todayJobs
      }
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 34. MANAGER SCOPED: Get Single Request Detail with Verification (PART 6)
 */
exports.getManagerRequestById = async (req, res) => {
  try {
    const managerId = req.user?.id || req.user?._id;
    const { id } = req.params;

    const request = await Cart.findById(id)
      .populate('userId', 'firstName lastName fullName email contactNumber profilePic address')
      .populate('serviceId', 'serviceName serviceCost description serviceImage')
      .populate('assignedPartner', 'fullName partnerId email contactNumber profilePic teamId expertise rating hub');

    if (!request) {
      return res.status(404).json({ statusCode: 404, message: 'Service request not found' });
    }

    const manager = await Partner.findById(managerId)
      .populate('managerConfig.managedCategories', 'serviceName serviceHeading')
      .populate('managerConfig.managedAreas', 'name pincodes');

    const managedTeamIds = (manager?.managerConfig?.managedTeams || []).map(t => t.toString());

    // Validate scope
    let inScope = false;
    let resolvedTeam = null;
    let resolvedLeader = null;

    if (request.assignedPartner) {
      const partner = await Partner.findById(request.assignedPartner._id || request.assignedPartner);
      if (partner?.teamId) {
        const team = await Team.findById(partner.teamId);
        if (team && team.managerId?.toString() === managerId.toString() && managedTeamIds.includes(team._id.toString())) {
          inScope = true;
          resolvedTeam = team;
          if (team.teamLeaderId) {
            resolvedLeader = await Partner.findById(team.teamLeaderId).select('partnerId fullName email contactNumber');
          }
        }
      }
    } else {
      // Check unassigned matching
      const managedCategories = manager.managerConfig?.managedCategories || [];
      const categoryIds = managedCategories.map(c => c._id.toString());
      const categoryHeadings = managedCategories.flatMap(c => [c.serviceName, c.serviceHeading].filter(Boolean));

      const managedAreas = manager.managerConfig?.managedAreas || [];
      const hubNames = managedAreas.map(a => a.name);
      const hubPincodes = managedAreas.flatMap(a => a.pincodes || []);

      const matchesCat = (request.mainServiceId && categoryIds.includes(request.mainServiceId.toString())) ||
                         (categoryHeadings.some(h => new RegExp(h, 'i').test(request.serviceName)));
      const matchesArea = (request.deliveryAddress?.postalCode && hubPincodes.includes(request.deliveryAddress.postalCode)) ||
                          (request.deliveryAddress?.city && hubNames.some(n => new RegExp(n, 'i').test(request.deliveryAddress.city)));

      if (matchesCat || matchesArea) {
        inScope = true;
      }
    }

    if (!inScope && normalizeRole(req.user?.role) !== 'ADMIN' && normalizeRole(req.user?.role) !== 'SUBADMIN') {
      return res.status(403).json({
        statusCode: 403,
        message: 'Access denied: Service request is outside your operational scope'
      });
    }

    const reqObj = request.toObject();
    reqObj.hierarchy = {
      manager: {
        id: manager._id,
        name: manager.fullName,
        partnerId: manager.partnerId
      },
      team: resolvedTeam ? { id: resolvedTeam._id, name: resolvedTeam.name, code: resolvedTeam.code } : null,
      teamLeader: resolvedLeader ? { id: resolvedLeader._id, name: resolvedLeader.fullName, partnerId: resolvedLeader.partnerId } : null,
      partner: request.assignedPartner ? {
        id: request.assignedPartner._id,
        name: request.assignedPartner.fullName,
        partnerId: request.assignedPartner.partnerId,
        contactNumber: request.assignedPartner.contactNumber
      } : null
    };

    res.status(200).json({
      statusCode: 200,
      message: 'Service request details fetched successfully',
      data: reqObj
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 35. TEAM LEADER SCOPED: Get Squad Service Requests / Jobs (PART 6)
 */
exports.getTeamLeaderRequests = async (req, res) => {
  try {
    const leaderId = req.user?.id || req.user?._id;
    const {
      status = 'all',
      partnerId,
      scheduledDate,
      search = '',
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const leader = await Partner.findById(leaderId);
    if (!leader || leader.teamLeaderConfig?.status !== 'ACTIVE') {
      return res.status(403).json({
        statusCode: 403,
        message: 'Access denied: Team Leader account is inactive or not found'
      });
    }

    const teamId = leader.teamLeaderConfig?.teamId;
    if (!teamId) {
      return res.status(403).json({
        statusCode: 403,
        message: 'Access denied: You are not currently assigned to an active team'
      });
    }

    const team = await Team.findById(teamId).select('name code managerId');
    const partners = await Partner.find({
      role: 'PARTNER',
      teamId,
      isDeleted: false
    }).select('_id fullName partnerId email contactNumber designation');

    const partnerIds = partners.map(p => p._id);
    const partnerMap = new Map();
    partners.forEach(p => partnerMap.set(p._id.toString(), p));

    // Scope query strictly to squad partners
    let targetPartnerFilter = { $in: partnerIds };
    if (partnerId) {
      if (!partnerIds.some(id => id.toString() === partnerId.toString())) {
        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied: Requested partner is not a member of your squad'
        });
      }
      targetPartnerFilter = partnerId;
    }

    const query = {
      status: { $ne: 'addToCart' },
      assignedPartner: targetPartnerFilter
    };

    if (status !== 'all') {
      query.status = status;
    }

    if (scheduledDate) {
      const startOfDay = new Date(scheduledDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(scheduledDate);
      endOfDay.setHours(23, 59, 59, 999);
      query.scheduledDate = { $gte: startOfDay, $lte: endOfDay };
    }

    if (search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { orderId: regex },
        { serviceName: regex },
        { 'deliveryAddress.street': regex },
        { 'deliveryAddress.city': regex },
        { 'contactNumber.number': regex }
      ];
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const sortOption = {};
    sortOption[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const [requests, totalCount, pendingCount, inProgressCount, completedCount] = await Promise.all([
      Cart.find(query)
        .populate('userId', 'firstName lastName fullName email contactNumber')
        .populate('serviceId', 'serviceName serviceCost')
        .populate('assignedPartner', 'fullName partnerId email contactNumber profilePic')
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum),
      Cart.countDocuments(query),
      Cart.countDocuments({ assignedPartner: { $in: partnerIds }, status: 'pending' }),
      Cart.countDocuments({ assignedPartner: { $in: partnerIds }, status: 'inProgress' }),
      Cart.countDocuments({ assignedPartner: { $in: partnerIds }, status: 'completed' })
    ]);

    const enhanced = requests.map(reqDoc => {
      const obj = reqDoc.toObject();
      obj.hierarchy = {
        team: { id: team._id, name: team.name, code: team.code },
        teamLeader: { id: leader._id, name: leader.fullName, partnerId: leader.partnerId },
        partner: obj.assignedPartner ? {
          id: obj.assignedPartner._id,
          name: obj.assignedPartner.fullName,
          partnerId: obj.assignedPartner.partnerId
        } : null
      };
      return obj;
    });

    res.status(200).json({
      statusCode: 200,
      message: 'Team squad service requests fetched successfully',
      data: enhanced,
      stats: {
        total: totalCount,
        pending: pendingCount,
        inProgress: inProgressCount,
        completed: completedCount
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitNum)
      }
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 36. TEAM LEADER SCOPED: Get Single Squad Request Detail (PART 6)
 */
exports.getTeamLeaderRequestById = async (req, res) => {
  try {
    const leaderId = req.user?.id || req.user?._id;
    const { id } = req.params;

    const leader = await Partner.findById(leaderId);
    const teamId = leader?.teamLeaderConfig?.teamId;
    if (!teamId) {
      return res.status(403).json({ statusCode: 403, message: 'Access denied: No active team assignment' });
    }

    const request = await Cart.findById(id)
      .populate('userId', 'firstName lastName fullName email contactNumber profilePic address')
      .populate('serviceId', 'serviceName serviceCost description serviceImage')
      .populate('assignedPartner', 'fullName partnerId email contactNumber profilePic teamId');

    if (!request) {
      return res.status(404).json({ statusCode: 404, message: 'Service request not found' });
    }

    if (!request.assignedPartner) {
      return res.status(403).json({
        statusCode: 403,
        message: 'Access denied: Unassigned requests can only be accessed by Managers or Admins'
      });
    }

    const partner = await Partner.findById(request.assignedPartner._id || request.assignedPartner);
    if (!partner || !partner.teamId || partner.teamId.toString() !== teamId.toString()) {
      return res.status(403).json({
        statusCode: 403,
        message: 'Access denied: This request is not assigned to a member of your squad'
      });
    }

    res.status(200).json({
      statusCode: 200,
      message: 'Squad service request fetched successfully',
      data: request
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 37. ASSIGN SERVICE REQUEST / JOB (PART 6)
 * Strictly validates 409 Conflict if already assigned.
 * Uses atomic MongoDB transaction/session.
 */
exports.assignJob = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { requestId } = req.params;
    const { partnerId, scheduledDate, notes } = req.body;
    const callerRole = normalizeRole(req.user?.role);
    const callerId = req.user?.id || req.user?._id;

    if (!partnerId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ statusCode: 400, message: 'Target partnerId is required' });
    }

    // 1. Request existence check
    const request = await Cart.findById(requestId).session(session);
    if (!request) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ statusCode: 404, message: 'Service request not found' });
    }

    // 2. Request assignability check
    if (['completed', 'cancelled'].includes(request.status)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        statusCode: 400,
        message: `Cannot assign: Service request is already ${request.status}.`
      });
    }

    // 3. REASSIGNMENT SAFETY: 409 Conflict check if already assigned
    if (request.assignedPartner) {
      const currentPartner = await Partner.findById(request.assignedPartner).select('partnerId fullName email contactNumber');
      await session.abortTransaction();
      session.endSession();
      return res.status(409).json({
        statusCode: 409,
        conflict: true,
        message: 'This service request is already assigned to a Partner. Use the explicit Reassign action to replace the assignment.',
        currentPartner: currentPartner ? {
          _id: currentPartner._id,
          partnerId: currentPartner.partnerId,
          fullName: currentPartner.fullName
        } : null
      });
    }

    // 4. Target partner validation
    const targetPartner = await Partner.findOne({ _id: partnerId, isDeleted: false }).session(session);
    if (!targetPartner) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ statusCode: 404, message: 'Target partner not found' });
    }

    if (!targetPartner.isActive) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ statusCode: 400, message: 'Cannot assign: Target partner account is inactive.' });
    }

    if (normalizeRole(targetPartner.role) !== 'PARTNER') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ statusCode: 400, message: 'Cannot assign: Target user is not an operational partner.' });
    }

    if (!targetPartner.teamId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ statusCode: 400, message: 'Cannot assign: Target partner is not assigned to any team.' });
    }

    // 5. Manager Scope Verification
    const targetTeam = await Team.findById(targetPartner.teamId).session(session);
    if (!targetTeam) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ statusCode: 404, message: 'Target team not found' });
    }

    if (callerRole === 'MANAGER') {
      const manager = await Partner.findById(callerId).select('managerConfig').session(session);
      const managedTeams = (manager?.managerConfig?.managedTeams || []).map(t => t.toString());

      if (
        !targetTeam.managerId ||
        targetTeam.managerId.toString() !== callerId.toString() ||
        !managedTeams.includes(targetTeam._id.toString())
      ) {
        await session.abortTransaction();
        session.endSession();
        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied: Target partner belongs to a team outside your management scope'
        });
      }
    }

    if (targetTeam.status !== 'ACTIVE') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        statusCode: 400,
        message: 'Cannot assign: Target team is currently INACTIVE.'
      });
    }

    // 6. Update Assignment & Tracking
    const newStatus = (request.status === 'addToCart' || request.status === 'pending') ? 'assigned' : request.status;
    const trackingMsg = notes
      ? `Task assigned to ${targetPartner.fullName} (${targetTeam.name}). Note: ${notes}`
      : `Task assigned to ${targetPartner.fullName} (${targetTeam.name})`;

    const updateFields = {
      assignedPartner: targetPartner._id,
      status: newStatus
    };

    if (scheduledDate) {
      updateFields.scheduledDate = new Date(scheduledDate);
    }

    const updatedRequest = await Cart.findByIdAndUpdate(
      requestId,
      {
        $set: updateFields,
        $push: {
          tracking: {
            message: trackingMsg,
            status: newStatus,
            date: new Date()
          }
        }
      },
      { new: true, session }
    );

    // 7. Audit Logging inside transaction
    await ManagementAudit.create([
      {
        action: 'JOB_ASSIGNED',
        performedBy: {
          id: callerId,
          name: req.user?.fullName || req.user?.firstName || 'Manager',
          role: callerRole
        },
        targetUser: {
          id: targetPartner._id,
          name: targetPartner.fullName,
          partnerId: targetPartner.partnerId,
          role: targetPartner.role
        },
        details: {
          requestId: request._id,
          orderId: request.orderId,
          serviceName: request.serviceName,
          team: { id: targetTeam._id, name: targetTeam.name, code: targetTeam.code },
          scheduledDate: updateFields.scheduledDate || request.scheduledDate,
          notes: notes || ''
        }
      }
    ], { session });

    await session.commitTransaction();
    session.endSession();

    // 8. Real-time Notification
    try {
      if (ably?.channels) {
        ably.channels.get(`partner-${targetPartner._id}`).publish('task_assigned', {
          message: 'A new task has been assigned to you',
          taskId: updatedRequest._id,
          orderId: updatedRequest.orderId
        });
        ably.channels.get('admin-channel').publish('task_updated', {
          message: `Task ${updatedRequest.orderId || updatedRequest._id} assigned to ${targetPartner.fullName}`,
          taskId: updatedRequest._id
        });
      }
    } catch (e) {
      console.warn('Real-time notify warning:', e.message);
    }

    res.status(200).json({
      statusCode: 200,
      message: `Service request successfully assigned to ${targetPartner.fullName}`,
      data: {
        requestId: updatedRequest._id,
        orderId: updatedRequest.orderId,
        assignedPartner: {
          _id: targetPartner._id,
          fullName: targetPartner.fullName,
          partnerId: targetPartner.partnerId
        },
        team: {
          _id: targetTeam._id,
          name: targetTeam.name
        },
        status: updatedRequest.status
      }
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 38. EXPLICIT JOB REASSIGNMENT (PART 6)
 * Reassigns an actively assigned job from Source Partner to Target Partner.
 * Validates cross-manager protection and uses atomic MongoDB transaction.
 */
exports.reassignJob = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { requestId } = req.params;
    const { partnerId, reason = '', scheduledDate } = req.body;
    const callerRole = normalizeRole(req.user?.role);
    const callerId = req.user?.id || req.user?._id;

    if (!partnerId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ statusCode: 400, message: 'Target partnerId is required' });
    }

    // 1. Request existence check
    const request = await Cart.findById(requestId).session(session);
    if (!request) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ statusCode: 404, message: 'Service request not found' });
    }

    // 2. Assignability check
    if (['completed', 'cancelled'].includes(request.status)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        statusCode: 400,
        message: `Cannot reassign: Service request is already ${request.status}.`
      });
    }

    // 3. Must have active source assignment
    if (!request.assignedPartner) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        statusCode: 400,
        message: 'This request is not currently assigned to any partner. Use the standard Assign action.'
      });
    }

    // 4. Cannot reassign to the exact same partner
    if (request.assignedPartner.toString() === partnerId.toString()) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        statusCode: 400,
        message: 'Cannot reassign: Target partner is already the assigned partner for this job.'
      });
    }

    // 5. Source Partner Validation
    const sourcePartner = await Partner.findById(request.assignedPartner).session(session);
    if (!sourcePartner) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ statusCode: 404, message: 'Current assigned partner not found' });
    }

    // 6. Target Partner Validation
    const targetPartner = await Partner.findOne({ _id: partnerId, isDeleted: false }).session(session);
    if (!targetPartner) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ statusCode: 404, message: 'Target partner not found' });
    }

    if (!targetPartner.isActive) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ statusCode: 400, message: 'Cannot reassign: Target partner account is inactive.' });
    }

    if (!targetPartner.teamId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ statusCode: 400, message: 'Cannot reassign: Target partner is not assigned to any team.' });
    }

    const sourceTeam = sourcePartner.teamId ? await Team.findById(sourcePartner.teamId).session(session) : null;
    const targetTeam = await Team.findById(targetPartner.teamId).session(session);
    if (!targetTeam) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ statusCode: 404, message: 'Target team not found' });
    }

    // 7. CROSS-MANAGER REASSIGNMENT PROTECTION
    if (callerRole === 'MANAGER') {
      const manager = await Partner.findById(callerId).select('managerConfig').session(session);
      const managedTeams = (manager?.managerConfig?.managedTeams || []).map(t => t.toString());

      // Source check: source team must belong to this manager
      if (sourceTeam) {
        if (
          !sourceTeam.managerId ||
          sourceTeam.managerId.toString() !== callerId.toString() ||
          !managedTeams.includes(sourceTeam._id.toString())
        ) {
          await session.abortTransaction();
          session.endSession();
          return res.status(403).json({
            statusCode: 403,
            message: 'Access denied: Current assigned partner belongs to a team outside your management scope'
          });
        }
      }

      // Target check: target team must belong to this manager
      if (
        !targetTeam.managerId ||
        targetTeam.managerId.toString() !== callerId.toString() ||
        !managedTeams.includes(targetTeam._id.toString())
      ) {
        await session.abortTransaction();
        session.endSession();
        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied: Target partner belongs to a team outside your management scope'
        });
      }
    }

    if (targetTeam.status !== 'ACTIVE') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        statusCode: 400,
        message: 'Cannot reassign: Target team is currently INACTIVE.'
      });
    }

    // 8. Update Assignment & Tracking
    const trackingMsg = reason
      ? `Task reassigned from ${sourcePartner.fullName} to ${targetPartner.fullName}. Reason: ${reason}`
      : `Task reassigned from ${sourcePartner.fullName} to ${targetPartner.fullName}`;

    const updateFields = {
      assignedPartner: targetPartner._id
    };
    if (scheduledDate) {
      updateFields.scheduledDate = new Date(scheduledDate);
    }

    const updatedRequest = await Cart.findByIdAndUpdate(
      requestId,
      {
        $set: updateFields,
        $push: {
          tracking: {
            message: trackingMsg,
            status: request.status,
            date: new Date()
          }
        }
      },
      { new: true, session }
    );

    // 9. Audit Logging inside transaction
    await ManagementAudit.create([
      {
        action: 'JOB_REASSIGNED',
        performedBy: {
          id: callerId,
          name: req.user?.fullName || req.user?.firstName || 'Manager',
          role: callerRole
        },
        targetUser: {
          id: targetPartner._id,
          name: targetPartner.fullName,
          partnerId: targetPartner.partnerId,
          role: targetPartner.role
        },
        details: {
          requestId: request._id,
          orderId: request.orderId,
          serviceName: request.serviceName,
          previousPartner: {
            id: sourcePartner._id,
            name: sourcePartner.fullName,
            partnerId: sourcePartner.partnerId,
            team: sourceTeam ? { id: sourceTeam._id, name: sourceTeam.name } : null
          },
          newPartner: {
            id: targetPartner._id,
            name: targetPartner.fullName,
            partnerId: targetPartner.partnerId,
            team: { id: targetTeam._id, name: targetTeam.name }
          },
          reason: reason || 'Explicit reassignment'
        }
      }
    ], { session });

    await session.commitTransaction();
    session.endSession();

    // 10. Real-time Notifications
    try {
      if (ably?.channels) {
        ably.channels.get(`partner-${sourcePartner._id}`).publish('task_unassigned', {
          message: `Task ${updatedRequest.orderId || updatedRequest._id} has been reassigned to another partner`,
          taskId: updatedRequest._id
        });
        ably.channels.get(`partner-${targetPartner._id}`).publish('task_assigned', {
          message: 'A new task has been reassigned to you',
          taskId: updatedRequest._id,
          orderId: updatedRequest.orderId
        });
        ably.channels.get('admin-channel').publish('task_updated', {
          message: `Task ${updatedRequest.orderId || updatedRequest._id} reassigned from ${sourcePartner.fullName} to ${targetPartner.fullName}`,
          taskId: updatedRequest._id
        });
      }
    } catch (e) {
      console.warn('Real-time notification warning:', e.message);
    }

    res.status(200).json({
      statusCode: 200,
      message: `Service request successfully reassigned to ${targetPartner.fullName}`,
      data: {
        requestId: updatedRequest._id,
        orderId: updatedRequest.orderId,
        previousPartner: {
          _id: sourcePartner._id,
          fullName: sourcePartner.fullName,
          partnerId: sourcePartner.partnerId
        },
        newPartner: {
          _id: targetPartner._id,
          fullName: targetPartner.fullName,
          partnerId: targetPartner.partnerId
        },
        team: {
          _id: targetTeam._id,
          name: targetTeam.name
        }
      }
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 39. SCOPED JOB STATUS UPDATE (PART 6)
 */
exports.updateJobStatus = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status, trackingMessage } = req.body;
    const callerRole = normalizeRole(req.user?.role);
    const callerId = req.user?.id || req.user?._id;

    if (!status) {
      return res.status(400).json({ statusCode: 400, message: 'Status is required' });
    }

    const validStatuses = ['pending', 'assigned', 'inProgress', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ statusCode: 400, message: `Invalid status '${status}'. Valid: ${validStatuses.join(', ')}` });
    }

    const request = await Cart.findById(requestId);
    if (!request) {
      return res.status(404).json({ statusCode: 404, message: 'Service request not found' });
    }

    // Lifecycle transition protection: Cannot revive completed or cancelled jobs
    if (['completed', 'cancelled'].includes(request.status) && request.status !== status) {
      return res.status(400).json({
        statusCode: 400,
        message: `Cannot transition job: Current status is already '${request.status}' and cannot be modified.`
      });
    }

    // Scope check for Manager and Team Leader
    if (callerRole === 'MANAGER') {
      const manager = await Partner.findById(callerId).select('managerConfig');
      const managedTeams = (manager?.managerConfig?.managedTeams || []).map(t => t.toString());

      if (request.assignedPartner) {
        const partner = await Partner.findById(request.assignedPartner);
        const team = partner?.teamId ? await Team.findById(partner.teamId) : null;
        if (!team || team.managerId?.toString() !== callerId.toString() || !managedTeams.includes(team._id.toString())) {
          return res.status(403).json({
            statusCode: 403,
            message: 'Access denied: This request is outside your management scope'
          });
        }
      }
    } else if (callerRole === 'TEAM_LEADER') {
      const leader = await Partner.findById(callerId);
      const teamId = leader?.teamLeaderConfig?.teamId;

      if (!request.assignedPartner) {
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Squad leader cannot manage unassigned jobs' });
      }

      const partner = await Partner.findById(request.assignedPartner);
      if (!partner?.teamId || partner.teamId.toString() !== teamId?.toString()) {
        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied: This request is not assigned to a member of your squad'
        });
      }
    }

    const prevStatus = request.status;
    request.status = status;
    const msg = trackingMessage || `Status updated from ${prevStatus} to ${status}`;

    request.tracking.push({
      message: msg,
      status,
      date: new Date()
    });

    if (status === 'completed') {
      request.completedAt = new Date();
    }

    await request.save();

    await ManagementAudit.create({
      action: 'JOB_STATUS_UPDATED',
      performedBy: {
        id: callerId,
        name: req.user?.fullName || req.user?.firstName || 'User',
        role: callerRole
      },
      details: {
        requestId: request._id,
        orderId: request.orderId,
        previousStatus: prevStatus,
        newStatus: status,
        message: msg
      }
    });

    res.status(200).json({
      statusCode: 200,
      message: `Service request status updated to ${status}`,
      data: {
        requestId: request._id,
        status: request.status,
        completedAt: request.completedAt
      }
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};


// ==========================================
// PART 7: OPERATIONAL TRACKING, SCHEDULING & WORKLOAD
// ==========================================

/**
 * Helper: Centralized Overdue Calculation
 * A job is overdue when current time > scheduled end time (or end of scheduled day)
 * and status is NOT completed, cancelled, or addToCart.
 */
function isJobOverdue(job) {
  if (!job || ['completed', 'cancelled', 'addToCart'].includes(job.status)) {
    return false;
  }
  if (!job.scheduledDate) {
    return false;
  }
  const now = new Date();
  const scheduled = new Date(job.scheduledDate);

  if (job.scheduledEndTime) {
    const parts = job.scheduledEndTime.split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    if (!isNaN(hours) && !isNaN(minutes)) {
      scheduled.setHours(hours, minutes, 0, 0);
      return now > scheduled;
    }
  }

  // Date-only rule: overdue if now is past the end of the scheduled calendar day
  scheduled.setHours(23, 59, 59, 999);
  return now > scheduled;
}

/**
 * Helper: Schedule Conflict Detection
 * Checks if the partner already has another active job scheduled during the specified time window.
 */
async function findScheduleConflict(partnerId, scheduledDate, startTime, endTime, excludeRequestId = null, session = null) {
  if (!partnerId || !scheduledDate || !startTime || !endTime) {
    return null;
  }

  const startOfDay = new Date(scheduledDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(scheduledDate);
  endOfDay.setHours(23, 59, 59, 999);

  const query = {
    assignedPartner: partnerId,
    status: { $in: ['pending', 'assigned', 'inProgress'] },
    scheduledDate: { $gte: startOfDay, $lte: endOfDay },
    scheduledStartTime: { $exists: true, $ne: '' },
    scheduledEndTime: { $exists: true, $ne: '' }
  };

  if (excludeRequestId) {
    query._id = { $ne: excludeRequestId };
  }

  let reqQuery = Cart.find(query).select('orderId scheduledDate scheduledStartTime scheduledEndTime serviceName');
  if (session) reqQuery = reqQuery.session(session);
  const existingJobs = await reqQuery;

  for (const job of existingJobs) {
    // Overlapping intervals check: (StartA < EndB) && (EndA > StartB)
    if (startTime < job.scheduledEndTime && endTime > job.scheduledStartTime) {
      return job;
    }
  }
  return null;
}

/**
 * 40. RESCHEDULE SERVICE REQUEST / JOB (PART 7)
 * Strictly validates request status, manager scope, and schedule conflict.
 * Uses atomic MongoDB transaction/session.
 */
exports.rescheduleJob = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { requestId } = req.params;
    const { scheduledDate, scheduledStartTime, scheduledEndTime, reason = '' } = req.body;
    const callerRole = normalizeRole(req.user?.role);
    const callerId = req.user?.id || req.user?._id;

    if (!scheduledDate) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ statusCode: 400, message: 'scheduledDate is required for rescheduling' });
    }

    const request = await Cart.findById(requestId).session(session);
    if (!request) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ statusCode: 404, message: 'Service request not found' });
    }

    // 1. Status Check: Completed or Cancelled jobs cannot be rescheduled
    if (['completed', 'cancelled'].includes(request.status)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        statusCode: 400,
        message: `Cannot reschedule: Service request is already ${request.status} and cannot be modified.`
      });
    }

    // 2. Manager Scope Validation
    if (callerRole === 'MANAGER') {
      const manager = await Partner.findById(callerId).select('managerConfig').session(session);
      const managedTeams = (manager?.managerConfig?.managedTeams || []).map(t => t.toString());

      if (request.assignedPartner) {
        const partner = await Partner.findById(request.assignedPartner).session(session);
        const team = partner?.teamId ? await Team.findById(partner.teamId).session(session) : null;
        if (!team || team.managerId?.toString() !== callerId.toString() || !managedTeams.includes(team._id.toString())) {
          await session.abortTransaction();
          session.endSession();
          return res.status(403).json({
            statusCode: 403,
            message: 'Access denied: Request belongs to a partner/team outside your management scope'
          });
        }
      } else {
        // Unassigned request scope
        const managedCategories = (manager?.managerConfig?.managedCategories || []).map(c => c.toString());
        const managedAreas = (manager?.managerConfig?.managedAreas || []).map(a => a.toString());
        const hubs = await Hub.find({ _id: { $in: managedAreas } }).select('name pincodes').session(session);
        const hubNames = hubs.map(h => h.name);
        const allPincodes = hubs.flatMap(h => h.pincodes || []);

        const matchesCat = request.mainServiceId && managedCategories.includes(request.mainServiceId.toString());
        const matchesArea = (request.deliveryAddress?.postalCode && allPincodes.includes(request.deliveryAddress.postalCode)) ||
                            (request.deliveryAddress?.city && hubNames.includes(request.deliveryAddress.city));

        if (!matchesCat && !matchesArea) {
          await session.abortTransaction();
          session.endSession();
          return res.status(403).json({
            statusCode: 403,
            message: 'Access denied: Unassigned request is outside your operational scope'
          });
        }
      }
    }

    // 3. Schedule Conflict Detection
    if (request.assignedPartner && scheduledStartTime && scheduledEndTime) {
      const conflict = await findScheduleConflict(
        request.assignedPartner,
        scheduledDate,
        scheduledStartTime,
        scheduledEndTime,
        request._id,
        session
      );

      if (conflict) {
        await session.abortTransaction();
        session.endSession();
        return res.status(409).json({
          statusCode: 409,
          error: 'SCHEDULE_CONFLICT',
          message: 'Scheduling conflict: Partner already has another job scheduled during this time window.',
          conflict: {
            conflictingOrderId: conflict.orderId || conflict._id,
            scheduledDate: conflict.scheduledDate,
            scheduledStartTime: conflict.scheduledStartTime,
            scheduledEndTime: conflict.scheduledEndTime,
            serviceName: conflict.serviceName
          }
        });
      }
    }

    // 4. Update Schedule & Tracking
    const oldScheduleStr = request.scheduledDate
      ? `${new Date(request.scheduledDate).toLocaleDateString()} ${request.scheduledStartTime || ''}-${request.scheduledEndTime || ''}`.trim()
      : 'Unscheduled';

    const newScheduleStr = `${new Date(scheduledDate).toLocaleDateString()} ${scheduledStartTime || ''}-${scheduledEndTime || ''}`.trim();

    const trackingMsg = reason
      ? `Job rescheduled from ${oldScheduleStr} to ${newScheduleStr}. Reason: ${reason}`
      : `Job rescheduled from ${oldScheduleStr} to ${newScheduleStr}`;

    const updateFields = {
      scheduledDate: new Date(scheduledDate)
    };
    if (scheduledStartTime !== undefined) updateFields.scheduledStartTime = scheduledStartTime;
    if (scheduledEndTime !== undefined) updateFields.scheduledEndTime = scheduledEndTime;

    const updatedRequest = await Cart.findByIdAndUpdate(
      requestId,
      {
        $set: updateFields,
        $push: {
          tracking: {
            message: trackingMsg,
            status: request.status,
            date: new Date()
          }
        }
      },
      { new: true, session }
    );

    // 5. Audit Logging inside transaction
    await ManagementAudit.create([
      {
        action: 'JOB_RESCHEDULED',
        performedBy: {
          id: callerId,
          name: req.user?.fullName || req.user?.firstName || 'Manager',
          role: callerRole
        },
        targetUser: {
          id: request.assignedPartner || null,
          name: '',
          partnerId: '',
          role: 'PARTNER'
        },
        details: {
          requestId: request._id,
          orderId: request.orderId,
          previousSchedule: oldScheduleStr,
          newSchedule: newScheduleStr,
          reason: reason || 'Operational rescheduling'
        }
      }
    ], { session });

    await session.commitTransaction();
    session.endSession();

    // 6. Real-time event
    try {
      if (ably?.channels) {
        if (request.assignedPartner) {
          ably.channels.get(`partner-${request.assignedPartner}`).publish('job_rescheduled', {
            message: `Task ${updatedRequest.orderId || updatedRequest._id} rescheduled to ${newScheduleStr}`,
            taskId: updatedRequest._id,
            scheduledDate: updatedRequest.scheduledDate,
            scheduledStartTime: updatedRequest.scheduledStartTime,
            scheduledEndTime: updatedRequest.scheduledEndTime
          });
        }
        ably.channels.get('admin-channel').publish('task_updated', {
          message: `Task ${updatedRequest.orderId || updatedRequest._id} rescheduled`,
          taskId: updatedRequest._id
        });
      }
    } catch (e) {
      console.warn('Real-time notify warning:', e.message);
    }

    res.status(200).json({
      statusCode: 200,
      message: `Service request successfully rescheduled to ${newScheduleStr}`,
      data: {
        requestId: updatedRequest._id,
        orderId: updatedRequest.orderId,
        scheduledDate: updatedRequest.scheduledDate,
        scheduledStartTime: updatedRequest.scheduledStartTime,
        scheduledEndTime: updatedRequest.scheduledEndTime,
        status: updatedRequest.status
      }
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 41. MANAGER OPERATIONAL WORKLOAD & PERFORMANCE METRICS (PART 7)
 */
exports.getManagerWorkload = async (req, res) => {
  try {
    const managerId = req.user?.id || req.user?._id;
    const manager = await Partner.findById(managerId)
      .populate('managerConfig.managedCategories', 'serviceName serviceHeading')
      .populate('managerConfig.managedAreas', 'name pincodes');

    if (!manager) {
      return res.status(404).json({ statusCode: 404, message: 'Manager not found' });
    }

    const managedTeamIds = (manager.managerConfig?.managedTeams || []).map(t => t.toString());

    // Teams belonging to manager
    const teams = await Team.find({
      managerId,
      _id: { $in: managedTeamIds }
    }).select('_id name code status teamLeaderId categories areas members');

    const teamIds = teams.map(t => t._id);

    // Team Leaders under manager
    const teamLeaders = await Partner.find({
      role: 'TEAM_LEADER',
      'teamLeaderConfig.managerId': managerId,
      isDeleted: false
    }).select('_id fullName partnerId email contactNumber teamLeaderConfig');

    const leaderMap = new Map();
    teamLeaders.forEach(l => leaderMap.set(l._id.toString(), l));

    // Partners belonging to these teams
    const partners = await Partner.find({
      role: 'PARTNER',
      teamId: { $in: teamIds },
      isDeleted: false
    }).select('_id fullName partnerId email contactNumber designation hub expertise teamId operationalStatus isActive');

    const partnerIds = partners.map(p => p._id);
    const partnerMap = new Map();
    partners.forEach(p => partnerMap.set(p._id.toString(), p));

    // Time boundaries for Today in IST
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Fetch active & relevant scoped jobs
    const activeJobs = await Cart.find({
      assignedPartner: { $in: partnerIds },
      status: { $in: ['pending', 'assigned', 'inProgress', 'completed'] }
    }).select('_id orderId serviceName status assignedPartner scheduledDate scheduledStartTime scheduledEndTime createdAt completedAt');

    // Build unassigned queries
    const managedCategories = manager.managerConfig?.managedCategories || [];
    const categoryIds = managedCategories.map(c => c._id.toString());
    const categoryHeadings = managedCategories.flatMap(c => [c.serviceName, c.serviceHeading].filter(Boolean));
    const managedAreas = manager.managerConfig?.managedAreas || [];
    const hubNames = managedAreas.map(a => a.name);
    const hubPincodes = managedAreas.flatMap(a => a.pincodes || []);

    const unassignedScopeConditions = [];
    if (categoryIds.length > 0) unassignedScopeConditions.push({ mainServiceId: { $in: categoryIds } });
    if (categoryHeadings.length > 0) unassignedScopeConditions.push({ serviceName: { $in: categoryHeadings.map(h => new RegExp(h, 'i')) } });
    if (hubPincodes.length > 0) unassignedScopeConditions.push({ 'deliveryAddress.postalCode': { $in: hubPincodes } });
    if (hubNames.length > 0) unassignedScopeConditions.push({ 'deliveryAddress.city': { $in: hubNames.map(n => new RegExp(n, 'i')) } });

    const unassignedCount = await Cart.countDocuments({
      status: { $ne: 'addToCart' },
      $and: [
        {
          $or: [
            { assignedPartner: null },
            { assignedPartner: { $exists: false } }
          ]
        },
        ...(unassignedScopeConditions.length > 0 ? [{ $or: unassignedScopeConditions }] : [])
      ]
    });

    // Partner-level workload calculation
    const partnerWorkloadMap = new Map();
    partners.forEach(p => {
      const pIdStr = p._id.toString();
      const pJobs = activeJobs.filter(j => j.assignedPartner?.toString() === pIdStr);
      const activePJobs = pJobs.filter(j => ['pending', 'assigned', 'inProgress'].includes(j.status));
      const completedToday = pJobs.filter(j => j.status === 'completed' && j.completedAt >= todayStart && j.completedAt <= todayEnd);
      const overdueJobs = pJobs.filter(j => isJobOverdue(j));

      const dailyCapacity = p.operationalStatus?.dailyCapacity || 5;
      const remainingCapacity = Math.max(0, dailyCapacity - activePJobs.length);
      const isOverloaded = activePJobs.length >= dailyCapacity;

      partnerWorkloadMap.set(pIdStr, {
        partnerId: p._id,
        partnerCode: p.partnerId,
        fullName: p.fullName,
        designation: p.designation || 'Partner',
        teamId: p.teamId,
        isActive: p.isActive,
        availability: p.operationalStatus?.availability || (p.isActive ? 'AVAILABLE' : 'INACTIVE'),
        dailyCapacity,
        activeJobsCount: activePJobs.length,
        completedTodayCount: completedToday.length,
        overdueCount: overdueJobs.length,
        remainingCapacity,
        isOverloaded
      });
    });

    // Team-level workload aggregation
    const teamWorkloadList = teams.map(team => {
      const tIdStr = team._id.toString();
      const teamPartners = partners.filter(p => p.teamId?.toString() === tIdStr);
      const teamPartnerIds = teamPartners.map(p => p._id.toString());

      const teamJobs = activeJobs.filter(j => teamPartnerIds.includes(j.assignedPartner?.toString()));
      const activeTeamJobs = teamJobs.filter(j => ['pending', 'assigned', 'inProgress'].includes(j.status));
      const scheduledToday = teamJobs.filter(j => j.scheduledDate >= todayStart && j.scheduledDate <= todayEnd);
      const inProgress = teamJobs.filter(j => j.status === 'inProgress');
      const completedToday = teamJobs.filter(j => j.status === 'completed' && j.completedAt >= todayStart && j.completedAt <= todayEnd);
      const overdue = teamJobs.filter(j => isJobOverdue(j));

      const availablePartners = teamPartners.filter(p => (p.operationalStatus?.availability || 'AVAILABLE') === 'AVAILABLE' && p.isActive).length;
      const busyPartners = teamPartners.filter(p => (p.operationalStatus?.availability) === 'BUSY').length;

      let leaderInfo = null;
      if (team.teamLeaderId && leaderMap.has(team.teamLeaderId.toString())) {
        const l = leaderMap.get(team.teamLeaderId.toString());
        leaderInfo = { id: l._id, fullName: l.fullName, partnerId: l.partnerId };
      }

      return {
        teamId: team._id,
        name: team.name,
        code: team.code,
        status: team.status,
        teamLeader: leaderInfo,
        totalPartners: teamPartners.length,
        availablePartners,
        busyPartners,
        activeJobsCount: activeTeamJobs.length,
        scheduledTodayCount: scheduledToday.length,
        inProgressCount: inProgress.length,
        completedTodayCount: completedToday.length,
        overdueCount: overdue.length
      };
    });

    // Global summary
    const allActiveJobs = activeJobs.filter(j => ['pending', 'assigned', 'inProgress'].includes(j.status));
    const allTodayScheduled = activeJobs.filter(j => j.scheduledDate >= todayStart && j.scheduledDate <= todayEnd);
    const allInProgress = activeJobs.filter(j => j.status === 'inProgress');
    const allCompletedToday = activeJobs.filter(j => j.status === 'completed' && j.completedAt >= todayStart && j.completedAt <= todayEnd);
    const allOverdue = activeJobs.filter(j => isJobOverdue(j));

    res.status(200).json({
      statusCode: 200,
      message: 'Manager operational workload metrics fetched successfully',
      data: {
        summary: {
          totalActiveJobs: allActiveJobs.length,
          scheduledToday: allTodayScheduled.length,
          inProgress: allInProgress.length,
          completedToday: allCompletedToday.length,
          overdueJobs: allOverdue.length,
          unassignedJobs: unassignedCount
        },
        teams: teamWorkloadList,
        partners: Array.from(partnerWorkloadMap.values())
      }
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 42. TEAM LEADER SQUAD WORKLOAD (PART 7)
 */
exports.getTeamLeaderWorkload = async (req, res) => {
  try {
    const leaderId = req.user?.id || req.user?._id;
    const leader = await Partner.findById(leaderId);
    if (!leader || leader.teamLeaderConfig?.status !== 'ACTIVE') {
      return res.status(403).json({ statusCode: 403, message: 'Access denied: Team Leader is inactive' });
    }

    const teamId = leader.teamLeaderConfig?.teamId;
    if (!teamId) {
      return res.status(403).json({ statusCode: 403, message: 'Access denied: No active team assignment' });
    }

    const team = await Team.findById(teamId).select('name code status');
    const partners = await Partner.find({
      role: 'PARTNER',
      teamId,
      isDeleted: false
    }).select('_id fullName partnerId designation expertise operationalStatus isActive');

    const partnerIds = partners.map(p => p._id);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const activeJobs = await Cart.find({
      assignedPartner: { $in: partnerIds },
      status: { $in: ['pending', 'assigned', 'inProgress', 'completed'] }
    }).select('_id orderId serviceName status assignedPartner scheduledDate scheduledStartTime scheduledEndTime completedAt');

    const partnerWorkloadList = partners.map(p => {
      const pIdStr = p._id.toString();
      const pJobs = activeJobs.filter(j => j.assignedPartner?.toString() === pIdStr);
      const activePJobs = pJobs.filter(j => ['pending', 'assigned', 'inProgress'].includes(j.status));
      const completedToday = pJobs.filter(j => j.status === 'completed' && j.completedAt >= todayStart && j.completedAt <= todayEnd);
      const overdueJobs = pJobs.filter(j => isJobOverdue(j));

      const dailyCapacity = p.operationalStatus?.dailyCapacity || 5;
      const remainingCapacity = Math.max(0, dailyCapacity - activePJobs.length);

      return {
        partnerId: p._id,
        partnerCode: p.partnerId,
        fullName: p.fullName,
        designation: p.designation || 'Partner',
        availability: p.operationalStatus?.availability || (p.isActive ? 'AVAILABLE' : 'INACTIVE'),
        dailyCapacity,
        activeJobsCount: activePJobs.length,
        completedTodayCount: completedToday.length,
        overdueCount: overdueJobs.length,
        remainingCapacity
      };
    });

    const activeSquadJobs = activeJobs.filter(j => ['pending', 'assigned', 'inProgress'].includes(j.status));
    const scheduledToday = activeJobs.filter(j => j.scheduledDate >= todayStart && j.scheduledDate <= todayEnd);
    const inProgress = activeJobs.filter(j => j.status === 'inProgress');
    const completedToday = activeJobs.filter(j => j.status === 'completed' && j.completedAt >= todayStart && j.completedAt <= todayEnd);
    const overdue = activeJobs.filter(j => isJobOverdue(j));

    res.status(200).json({
      statusCode: 200,
      message: 'Squad workload metrics fetched successfully',
      data: {
        team: {
          id: team._id,
          name: team.name,
          code: team.code
        },
        summary: {
          totalActiveJobs: activeSquadJobs.length,
          scheduledToday: scheduledToday.length,
          inProgress: inProgress.length,
          completedToday: completedToday.length,
          overdueJobs: overdue.length
        },
        partners: partnerWorkloadList
      }
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 43. OPERATIONAL SCHEDULE BOARD (PART 7)
 */
exports.getManagerScheduleBoard = async (req, res) => {
  try {
    const managerId = req.user?.id || req.user?._id;
    const { date, teamId, partnerId, status } = req.query;

    const manager = await Partner.findById(managerId).select('managerConfig');
    if (!manager || manager.managerConfig?.status !== 'ACTIVE') {
      return res.status(403).json({ statusCode: 403, message: 'Access denied: Manager is inactive' });
    }

    const managedTeamIds = (manager.managerConfig?.managedTeams || []).map(t => t.toString());

    // Teams validation
    const teams = await Team.find({
      managerId,
      _id: { $in: managedTeamIds }
    }).select('_id name code teamLeaderId');

    const teamIds = teams.map(t => t._id.toString());
    const teamMap = new Map();
    teams.forEach(t => teamMap.set(t._id.toString(), t));

    if (teamId && !teamIds.includes(teamId.toString())) {
      return res.status(403).json({ statusCode: 403, message: 'Access denied: Team outside your management scope' });
    }

    // Scoped partners
    const partners = await Partner.find({
      role: 'PARTNER',
      teamId: { $in: teamId ? [teamId] : teamIds },
      isDeleted: false
    }).select('_id fullName partnerId contactNumber teamId');

    const partnerIds = partners.map(p => p._id.toString());
    const partnerMap = new Map();
    partners.forEach(p => partnerMap.set(p._id.toString(), p));

    if (partnerId && !partnerIds.includes(partnerId.toString())) {
      return res.status(403).json({ statusCode: 403, message: 'Access denied: Partner outside your management scope' });
    }

    // Date range: defaults to today if not provided
    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const query = {
      assignedPartner: partnerId ? partnerId : { $in: partnerIds },
      scheduledDate: { $gte: startOfDay, $lte: endOfDay },
      status: { $ne: 'addToCart' }
    };

    if (status && status !== 'all') {
      query.status = status;
    }

    const scheduledJobs = await Cart.find(query)
      .populate('userId', 'firstName lastName fullName contactNumber')
      .populate('serviceId', 'serviceName serviceCost')
      .populate('assignedPartner', 'fullName partnerId contactNumber teamId')
      .sort({ scheduledStartTime: 1, createdAt: 1 });

    const scheduleItems = scheduledJobs.map(job => {
      const jObj = job.toObject();
      const p = job.assignedPartner ? partnerMap.get(job.assignedPartner._id.toString()) : null;
      const t = p?.teamId ? teamMap.get(p.teamId.toString()) : null;

      jObj.hierarchy = {
        team: t ? { id: t._id, name: t.name, code: t.code } : null,
        partner: p ? { id: p._id, name: p.fullName, partnerId: p.partnerId } : null
      };
      jObj.isOverdue = isJobOverdue(job);
      return jObj;
    });

    res.status(200).json({
      statusCode: 200,
      message: 'Operational schedule board fetched successfully',
      date: targetDate.toISOString().slice(0, 10),
      data: scheduleItems
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 44. TEAM LEADER SQUAD SCHEDULE BOARD (PART 7)
 */
exports.getTeamLeaderScheduleBoard = async (req, res) => {
  try {
    const leaderId = req.user?.id || req.user?._id;
    const { date, partnerId, status } = req.query;

    const leader = await Partner.findById(leaderId);
    const teamId = leader?.teamLeaderConfig?.teamId;
    if (!teamId) {
      return res.status(403).json({ statusCode: 403, message: 'Access denied: No active team' });
    }

    const partners = await Partner.find({ role: 'PARTNER', teamId, isDeleted: false }).select('_id fullName partnerId');
    const partnerIds = partners.map(p => p._id.toString());

    if (partnerId && !partnerIds.includes(partnerId.toString())) {
      return res.status(403).json({ statusCode: 403, message: 'Access denied: Partner is not in your squad' });
    }

    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const query = {
      assignedPartner: partnerId ? partnerId : { $in: partnerIds },
      scheduledDate: { $gte: startOfDay, $lte: endOfDay },
      status: { $ne: 'addToCart' }
    };

    if (status && status !== 'all') {
      query.status = status;
    }

    const jobs = await Cart.find(query)
      .populate('userId', 'firstName lastName fullName contactNumber')
      .populate('serviceId', 'serviceName serviceCost')
      .populate('assignedPartner', 'fullName partnerId contactNumber')
      .sort({ scheduledStartTime: 1 });

    const items = jobs.map(job => {
      const obj = job.toObject();
      obj.isOverdue = isJobOverdue(job);
      return obj;
    });

    res.status(200).json({
      statusCode: 200,
      message: 'Squad schedule board fetched successfully',
      date: targetDate.toISOString().slice(0, 10),
      data: items
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 45. GET PARTNER AVAILABILITY (PART 7)
 */
exports.getPartnerAvailability = async (req, res) => {
  try {
    const { partnerId } = req.params;
    const callerRole = normalizeRole(req.user?.role);
    const callerId = req.user?.id || req.user?._id;

    const partner = await Partner.findOne({ _id: partnerId, isDeleted: false })
      .select('_id fullName partnerId designation teamId operationalStatus isActive');

    if (!partner) {
      return res.status(404).json({ statusCode: 404, message: 'Partner not found' });
    }

    // Scope check
    if (callerRole === 'MANAGER') {
      const manager = await Partner.findById(callerId).select('managerConfig');
      const managedTeams = (manager?.managerConfig?.managedTeams || []).map(t => t.toString());
      if (!partner.teamId) {
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Partner has no team' });
      }
      const team = await Team.findById(partner.teamId);
      if (!team || team.managerId?.toString() !== callerId.toString() || !managedTeams.includes(team._id.toString())) {
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Partner outside your manager scope' });
      }
    } else if (callerRole === 'TEAM_LEADER') {
      const leader = await Partner.findById(callerId);
      const teamId = leader?.teamLeaderConfig?.teamId;
      if (!partner.teamId || partner.teamId.toString() !== teamId?.toString()) {
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Partner not in your squad' });
      }
    } else if (callerRole === 'PARTNER') {
      if (callerId.toString() !== partner._id.toString()) {
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Cannot view other partner availability' });
      }
    }

    res.status(200).json({
      statusCode: 200,
      data: {
        partnerId: partner._id,
        partnerCode: partner.partnerId,
        fullName: partner.fullName,
        availability: partner.operationalStatus?.availability || (partner.isActive ? 'AVAILABLE' : 'INACTIVE'),
        dailyCapacity: partner.operationalStatus?.dailyCapacity || 5,
        lastStatusUpdate: partner.operationalStatus?.lastStatusUpdate
      }
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 46. UPDATE PARTNER AVAILABILITY (PART 7)
 */
exports.updatePartnerAvailability = async (req, res) => {
  try {
    const { partnerId } = req.params;
    const { availability, dailyCapacity } = req.body;
    const callerRole = normalizeRole(req.user?.role);
    const callerId = req.user?.id || req.user?._id;

    const validAvailabilities = ['AVAILABLE', 'BUSY', 'OFFLINE', 'ON_LEAVE', 'INACTIVE'];
    if (availability && !validAvailabilities.includes(availability)) {
      return res.status(400).json({
        statusCode: 400,
        message: `Invalid availability state. Valid: ${validAvailabilities.join(', ')}`
      });
    }

    const partner = await Partner.findOne({ _id: partnerId, isDeleted: false });
    if (!partner) {
      return res.status(404).json({ statusCode: 404, message: 'Partner not found' });
    }

    // Scope check
    if (callerRole === 'MANAGER') {
      const manager = await Partner.findById(callerId).select('managerConfig');
      const managedTeams = (manager?.managerConfig?.managedTeams || []).map(t => t.toString());
      if (!partner.teamId) {
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Partner has no team' });
      }
      const team = await Team.findById(partner.teamId);
      if (!team || team.managerId?.toString() !== callerId.toString() || !managedTeams.includes(team._id.toString())) {
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Partner outside your manager scope' });
      }
    } else if (callerRole === 'TEAM_LEADER') {
      const leader = await Partner.findById(callerId);
      const teamId = leader?.teamLeaderConfig?.teamId;
      if (!partner.teamId || partner.teamId.toString() !== teamId?.toString()) {
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Partner not in your squad' });
      }
    } else if (callerRole === 'PARTNER') {
      if (callerId.toString() !== partner._id.toString()) {
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Cannot modify other partner availability' });
      }
    }

    if (!partner.operationalStatus) {
      partner.operationalStatus = {};
    }

    const prevAvailability = partner.operationalStatus.availability || (partner.isActive ? 'AVAILABLE' : 'INACTIVE');
    if (availability) partner.operationalStatus.availability = availability;
    if (dailyCapacity !== undefined && Number(dailyCapacity) > 0) partner.operationalStatus.dailyCapacity = Number(dailyCapacity);
    partner.operationalStatus.lastStatusUpdate = new Date();

    await partner.save();

    await ManagementAudit.create({
      action: 'PARTNER_AVAILABILITY_UPDATED',
      performedBy: {
        id: callerId,
        name: req.user?.fullName || req.user?.firstName || 'User',
        role: callerRole
      },
      targetUser: {
        id: partner._id,
        name: partner.fullName,
        partnerId: partner.partnerId,
        role: partner.role
      },
      details: {
        previousAvailability: prevAvailability,
        newAvailability: partner.operationalStatus.availability,
        dailyCapacity: partner.operationalStatus.dailyCapacity
      }
    });

    try {
      if (ably?.channels) {
        ably.channels.get(`partner-${partner._id}`).publish('partner_availability_updated', {
          partnerId: partner._id,
          availability: partner.operationalStatus.availability,
          dailyCapacity: partner.operationalStatus.dailyCapacity
        });
      }
    } catch (e) {
      console.warn('Real-time notification warning:', e.message);
    }

    res.status(200).json({
      statusCode: 200,
      message: `Partner availability updated to ${partner.operationalStatus.availability}`,
      data: {
        partnerId: partner._id,
        availability: partner.operationalStatus.availability,
        dailyCapacity: partner.operationalStatus.dailyCapacity,
        lastStatusUpdate: partner.operationalStatus.lastStatusUpdate
      }
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};


// ==========================================
// PART 7: OPERATIONAL TRACKING, SCHEDULING & WORKLOAD
// ==========================================

/**
 * Helper: Centralized Overdue Calculation
 * A job is overdue when current time > scheduled end time (or end of scheduled day)
 * and status is NOT completed, cancelled, or addToCart.
 */
function isJobOverdue(job) {
  if (!job || ['completed', 'cancelled', 'addToCart'].includes(job.status)) {
    return false;
  }
  if (!job.scheduledDate) {
    return false;
  }
  const now = new Date();
  const scheduled = new Date(job.scheduledDate);

  if (job.scheduledEndTime) {
    const parts = job.scheduledEndTime.split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    if (!isNaN(hours) && !isNaN(minutes)) {
      scheduled.setHours(hours, minutes, 0, 0);
      return now > scheduled;
    }
  }

  // Date-only rule: overdue if now is past the end of the scheduled calendar day
  scheduled.setHours(23, 59, 59, 999);
  return now > scheduled;
}

/**
 * Helper: Schedule Conflict Detection
 * Checks if the partner already has another active job scheduled during the specified time window.
 */
async function findScheduleConflict(partnerId, scheduledDate, startTime, endTime, excludeRequestId = null, session = null) {
  if (!partnerId || !scheduledDate || !startTime || !endTime) {
    return null;
  }

  const startOfDay = new Date(scheduledDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(scheduledDate);
  endOfDay.setHours(23, 59, 59, 999);

  const query = {
    assignedPartner: partnerId,
    status: { $in: ['pending', 'assigned', 'inProgress'] },
    scheduledDate: { $gte: startOfDay, $lte: endOfDay },
    scheduledStartTime: { $exists: true, $ne: '' },
    scheduledEndTime: { $exists: true, $ne: '' }
  };

  if (excludeRequestId) {
    query._id = { $ne: excludeRequestId };
  }

  let reqQuery = Cart.find(query).select('orderId scheduledDate scheduledStartTime scheduledEndTime serviceName');
  if (session) reqQuery = reqQuery.session(session);
  const existingJobs = await reqQuery;

  for (const job of existingJobs) {
    // Overlapping intervals check: (StartA < EndB) && (EndA > StartB)
    if (startTime < job.scheduledEndTime && endTime > job.scheduledStartTime) {
      return job;
    }
  }
  return null;
}

/**
 * 40. RESCHEDULE SERVICE REQUEST / JOB (PART 7)
 * Strictly validates request status, manager scope, and schedule conflict.
 * Uses atomic MongoDB transaction/session.
 */
exports.rescheduleJob = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { requestId } = req.params;
    const { scheduledDate, scheduledStartTime, scheduledEndTime, reason = '' } = req.body;
    const callerRole = normalizeRole(req.user?.role);
    const callerId = req.user?.id || req.user?._id;

    if (!scheduledDate) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ statusCode: 400, message: 'scheduledDate is required for rescheduling' });
    }

    const request = await Cart.findById(requestId).session(session);
    if (!request) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ statusCode: 404, message: 'Service request not found' });
    }

    // 1. Status Check: Completed or Cancelled jobs cannot be rescheduled
    if (['completed', 'cancelled'].includes(request.status)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        statusCode: 400,
        message: `Cannot reschedule: Service request is already ${request.status} and cannot be modified.`
      });
    }

    // 2. Manager Scope Validation
    if (callerRole === 'MANAGER') {
      const manager = await Partner.findById(callerId).select('managerConfig').session(session);
      const managedTeams = (manager?.managerConfig?.managedTeams || []).map(t => t.toString());

      if (request.assignedPartner) {
        const partner = await Partner.findById(request.assignedPartner).session(session);
        const team = partner?.teamId ? await Team.findById(partner.teamId).session(session) : null;
        if (!team || team.managerId?.toString() !== callerId.toString() || !managedTeams.includes(team._id.toString())) {
          await session.abortTransaction();
          session.endSession();
          return res.status(403).json({
            statusCode: 403,
            message: 'Access denied: Request belongs to a partner/team outside your management scope'
          });
        }
      } else {
        // Unassigned request scope
        const managedCategories = (manager?.managerConfig?.managedCategories || []).map(c => c.toString());
        const managedAreas = (manager?.managerConfig?.managedAreas || []).map(a => a.toString());
        const hubs = await Hub.find({ _id: { $in: managedAreas } }).select('name pincodes').session(session);
        const hubNames = hubs.map(h => h.name);
        const allPincodes = hubs.flatMap(h => h.pincodes || []);

        const matchesCat = request.mainServiceId && managedCategories.includes(request.mainServiceId.toString());
        const matchesArea = (request.deliveryAddress?.postalCode && allPincodes.includes(request.deliveryAddress.postalCode)) ||
                            (request.deliveryAddress?.city && hubNames.includes(request.deliveryAddress.city));

        if (!matchesCat && !matchesArea) {
          await session.abortTransaction();
          session.endSession();
          return res.status(403).json({
            statusCode: 403,
            message: 'Access denied: Unassigned request is outside your operational scope'
          });
        }
      }
    } else if (callerRole === 'TEAM_LEADER') {
      const leader = await Partner.findById(callerId).session(session);
      const teamId = leader?.teamLeaderConfig?.teamId;
      if (!teamId) {
        await session.abortTransaction();
        session.endSession();
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Team Leader has no assigned team' });
      }
      const team = await Team.findById(teamId).session(session);
      const memberIds = (team?.members || []).map(m => m.toString());
      if (!request.assignedPartner || !memberIds.includes(request.assignedPartner.toString())) {
        await session.abortTransaction();
        session.endSession();
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Request is not assigned to your squad members' });
      }
    }

    // 3. Schedule Conflict Detection
    if (request.assignedPartner && scheduledStartTime && scheduledEndTime) {
      const conflict = await findScheduleConflict(
        request.assignedPartner,
        scheduledDate,
        scheduledStartTime,
        scheduledEndTime,
        request._id,
        session
      );

      if (conflict) {
        await session.abortTransaction();
        session.endSession();
        return res.status(409).json({
          statusCode: 409,
          error: 'SCHEDULE_CONFLICT',
          message: 'Scheduling conflict: Partner already has another job scheduled during this time window.',
          conflict: {
            conflictingOrderId: conflict.orderId || conflict._id,
            scheduledDate: conflict.scheduledDate,
            scheduledStartTime: conflict.scheduledStartTime,
            scheduledEndTime: conflict.scheduledEndTime,
            serviceName: conflict.serviceName
          }
        });
      }
    }

    // 4. Update Schedule & Tracking
    const oldScheduleStr = request.scheduledDate
      ? `${new Date(request.scheduledDate).toLocaleDateString()} ${request.scheduledStartTime || ''}-${request.scheduledEndTime || ''}`.trim()
      : 'Unscheduled';

    const newScheduleStr = `${new Date(scheduledDate).toLocaleDateString()} ${scheduledStartTime || ''}-${scheduledEndTime || ''}`.trim();

    const trackingMsg = reason
      ? `Job rescheduled from ${oldScheduleStr} to ${newScheduleStr}. Reason: ${reason}`
      : `Job rescheduled from ${oldScheduleStr} to ${newScheduleStr}`;

    const updateFields = {
      scheduledDate: new Date(scheduledDate)
    };
    if (scheduledStartTime !== undefined) updateFields.scheduledStartTime = scheduledStartTime;
    if (scheduledEndTime !== undefined) updateFields.scheduledEndTime = scheduledEndTime;

    const updatedRequest = await Cart.findByIdAndUpdate(
      requestId,
      {
        $set: updateFields,
        $push: {
          tracking: {
            message: trackingMsg,
            status: request.status,
            date: new Date()
          }
        }
      },
      { new: true, session }
    );

    // 5. Audit Logging inside transaction
    await ManagementAudit.create([
      {
        action: 'JOB_RESCHEDULED',
        performedBy: {
          id: callerId,
          name: req.user?.fullName || req.user?.firstName || 'Manager',
          role: callerRole
        },
        targetUser: {
          id: request.assignedPartner || null,
          name: '',
          partnerId: '',
          role: 'PARTNER'
        },
        details: {
          requestId: request._id,
          orderId: request.orderId,
          previousSchedule: oldScheduleStr,
          newSchedule: newScheduleStr,
          reason: reason || 'Operational rescheduling'
        }
      }
    ], { session });

    await session.commitTransaction();
    session.endSession();

    // 6. Real-time event
    try {
      if (ably?.channels) {
        if (request.assignedPartner) {
          ably.channels.get(`partner-${request.assignedPartner}`).publish('job_rescheduled', {
            message: `Task ${updatedRequest.orderId || updatedRequest._id} rescheduled to ${newScheduleStr}`,
            taskId: updatedRequest._id,
            scheduledDate: updatedRequest.scheduledDate,
            scheduledStartTime: updatedRequest.scheduledStartTime,
            scheduledEndTime: updatedRequest.scheduledEndTime
          });
        }
        ably.channels.get('admin-channel').publish('task_updated', {
          message: `Task ${updatedRequest.orderId || updatedRequest._id} rescheduled`,
          taskId: updatedRequest._id
        });
      }
    } catch (e) {
      console.warn('Real-time notify warning:', e.message);
    }

    res.status(200).json({
      statusCode: 200,
      message: `Service request successfully rescheduled to ${newScheduleStr}`,
      data: {
        requestId: updatedRequest._id,
        orderId: updatedRequest.orderId,
        scheduledDate: updatedRequest.scheduledDate,
        scheduledStartTime: updatedRequest.scheduledStartTime,
        scheduledEndTime: updatedRequest.scheduledEndTime,
        status: updatedRequest.status
      }
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 41. MANAGER OPERATIONAL WORKLOAD & PERFORMANCE METRICS (PART 7)
 */
exports.getManagerWorkload = async (req, res) => {
  try {
    const managerId = req.user?.id || req.user?._id;
    const manager = await Partner.findById(managerId)
      .populate('managerConfig.managedCategories', 'serviceName serviceHeading')
      .populate('managerConfig.managedAreas', 'name pincodes');

    if (!manager) {
      return res.status(404).json({ statusCode: 404, message: 'Manager not found' });
    }

    const managedTeamIds = (manager.managerConfig?.managedTeams || []).map(t => t.toString());

    // Teams belonging to manager
    const teams = await Team.find({
      managerId,
      _id: { $in: managedTeamIds }
    }).select('_id name code status teamLeaderId categories areas members');

    const teamIds = teams.map(t => t._id);

    // Team Leaders under manager
    const teamLeaders = await Partner.find({
      role: 'TEAM_LEADER',
      'teamLeaderConfig.managerId': managerId,
      isDeleted: false
    }).select('_id fullName partnerId email contactNumber teamLeaderConfig');

    const leaderMap = new Map();
    teamLeaders.forEach(l => leaderMap.set(l._id.toString(), l));

    // Partners belonging to these teams
    const partners = await Partner.find({
      role: 'PARTNER',
      teamId: { $in: teamIds },
      isDeleted: false
    }).select('_id fullName partnerId email contactNumber designation hub expertise teamId operationalStatus isActive');

    const partnerIds = partners.map(p => p._id);
    const partnerMap = new Map();
    partners.forEach(p => partnerMap.set(p._id.toString(), p));

    // Time boundaries for Today in IST
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Fetch active & relevant scoped jobs
    const activeJobs = await Cart.find({
      assignedPartner: { $in: partnerIds },
      status: { $in: ['pending', 'assigned', 'inProgress', 'completed'] }
    }).select('_id orderId serviceName status assignedPartner scheduledDate scheduledStartTime scheduledEndTime createdAt completedAt');

    // Build unassigned queries
    const managedCategories = manager.managerConfig?.managedCategories || [];
    const categoryIds = managedCategories.map(c => c._id.toString());
    const categoryHeadings = managedCategories.flatMap(c => [c.serviceName, c.serviceHeading].filter(Boolean));
    const managedAreas = manager.managerConfig?.managedAreas || [];
    const hubNames = managedAreas.map(a => a.name);
    const hubPincodes = managedAreas.flatMap(a => a.pincodes || []);

    const unassignedScopeConditions = [];
    if (categoryIds.length > 0) unassignedScopeConditions.push({ mainServiceId: { $in: categoryIds } });
    if (categoryHeadings.length > 0) unassignedScopeConditions.push({ serviceName: { $in: categoryHeadings.map(h => new RegExp(h, 'i')) } });
    if (hubPincodes.length > 0) unassignedScopeConditions.push({ 'deliveryAddress.postalCode': { $in: hubPincodes } });
    if (hubNames.length > 0) unassignedScopeConditions.push({ 'deliveryAddress.city': { $in: hubNames.map(n => new RegExp(n, 'i')) } });

    const unassignedCount = await Cart.countDocuments({
      status: { $ne: 'addToCart' },
      $and: [
        {
          $or: [
            { assignedPartner: null },
            { assignedPartner: { $exists: false } }
          ]
        },
        ...(unassignedScopeConditions.length > 0 ? [{ $or: unassignedScopeConditions }] : [])
      ]
    });

    // Partner-level workload calculation
    const partnerWorkloadMap = new Map();
    partners.forEach(p => {
      const pIdStr = p._id.toString();
      const pJobs = activeJobs.filter(j => j.assignedPartner?.toString() === pIdStr);
      const activePJobs = pJobs.filter(j => ['pending', 'assigned', 'inProgress'].includes(j.status));
      const completedToday = pJobs.filter(j => j.status === 'completed' && j.completedAt >= todayStart && j.completedAt <= todayEnd);
      const overdueJobs = pJobs.filter(j => isJobOverdue(j));

      const dailyCapacity = p.operationalStatus?.dailyCapacity || 5;
      const remainingCapacity = Math.max(0, dailyCapacity - activePJobs.length);
      const isOverloaded = activePJobs.length >= dailyCapacity;

      partnerWorkloadMap.set(pIdStr, {
        partnerId: p._id,
        partnerCode: p.partnerId,
        fullName: p.fullName,
        designation: p.designation || 'Partner',
        teamId: p.teamId,
        isActive: p.isActive,
        availability: p.operationalStatus?.availability || (p.isActive ? 'AVAILABLE' : 'INACTIVE'),
        dailyCapacity,
        activeJobsCount: activePJobs.length,
        completedTodayCount: completedToday.length,
        overdueCount: overdueJobs.length,
        remainingCapacity,
        isOverloaded
      });
    });

    // Team-level workload aggregation
    const teamWorkloadList = teams.map(team => {
      const tIdStr = team._id.toString();
      const teamPartners = partners.filter(p => p.teamId?.toString() === tIdStr);
      const teamPartnerIds = teamPartners.map(p => p._id.toString());

      const teamJobs = activeJobs.filter(j => teamPartnerIds.includes(j.assignedPartner?.toString()));
      const activeTeamJobs = teamJobs.filter(j => ['pending', 'assigned', 'inProgress'].includes(j.status));
      const scheduledToday = teamJobs.filter(j => j.scheduledDate >= todayStart && j.scheduledDate <= todayEnd);
      const inProgress = teamJobs.filter(j => j.status === 'inProgress');
      const completedToday = teamJobs.filter(j => j.status === 'completed' && j.completedAt >= todayStart && j.completedAt <= todayEnd);
      const overdue = teamJobs.filter(j => isJobOverdue(j));

      const availablePartners = teamPartners.filter(p => (p.operationalStatus?.availability || 'AVAILABLE') === 'AVAILABLE' && p.isActive).length;
      const busyPartners = teamPartners.filter(p => (p.operationalStatus?.availability) === 'BUSY').length;

      let leaderInfo = null;
      if (team.teamLeaderId && leaderMap.has(team.teamLeaderId.toString())) {
        const l = leaderMap.get(team.teamLeaderId.toString());
        leaderInfo = { id: l._id, fullName: l.fullName, partnerId: l.partnerId };
      }

      return {
        teamId: team._id,
        name: team.name,
        code: team.code,
        status: team.status,
        teamLeader: leaderInfo,
        totalPartners: teamPartners.length,
        availablePartners,
        busyPartners,
        activeJobsCount: activeTeamJobs.length,
        scheduledTodayCount: scheduledToday.length,
        inProgressCount: inProgress.length,
        completedTodayCount: completedToday.length,
        overdueCount: overdue.length
      };
    });

    // Global summary
    const allActiveJobs = activeJobs.filter(j => ['pending', 'assigned', 'inProgress'].includes(j.status));
    const allTodayScheduled = activeJobs.filter(j => j.scheduledDate >= todayStart && j.scheduledDate <= todayEnd);
    const allInProgress = activeJobs.filter(j => j.status === 'inProgress');
    const allCompletedToday = activeJobs.filter(j => j.status === 'completed' && j.completedAt >= todayStart && j.completedAt <= todayEnd);
    const allOverdue = activeJobs.filter(j => isJobOverdue(j));

    res.status(200).json({
      statusCode: 200,
      message: 'Manager operational workload metrics fetched successfully',
      data: {
        summary: {
          totalActiveJobs: allActiveJobs.length,
          scheduledToday: allTodayScheduled.length,
          inProgress: allInProgress.length,
          completedToday: allCompletedToday.length,
          overdueJobs: allOverdue.length,
          unassignedJobs: unassignedCount
        },
        teams: teamWorkloadList,
        partners: Array.from(partnerWorkloadMap.values())
      }
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 42. TEAM LEADER SQUAD WORKLOAD (PART 7)
 */
exports.getTeamLeaderWorkload = async (req, res) => {
  try {
    const leaderId = req.user?.id || req.user?._id;
    const leader = await Partner.findById(leaderId);
    if (!leader || leader.teamLeaderConfig?.status !== 'ACTIVE') {
      return res.status(403).json({ statusCode: 403, message: 'Access denied: Team Leader is inactive' });
    }

    const teamId = leader.teamLeaderConfig?.teamId;
    if (!teamId) {
      return res.status(403).json({ statusCode: 403, message: 'Access denied: No active team assignment' });
    }

    const team = await Team.findById(teamId).select('name code status');
    const partners = await Partner.find({
      role: 'PARTNER',
      teamId,
      isDeleted: false
    }).select('_id fullName partnerId designation expertise operationalStatus isActive');

    const partnerIds = partners.map(p => p._id);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const activeJobs = await Cart.find({
      assignedPartner: { $in: partnerIds },
      status: { $in: ['pending', 'assigned', 'inProgress', 'completed'] }
    }).select('_id orderId serviceName status assignedPartner scheduledDate scheduledStartTime scheduledEndTime completedAt');

    const partnerWorkloadList = partners.map(p => {
      const pIdStr = p._id.toString();
      const pJobs = activeJobs.filter(j => j.assignedPartner?.toString() === pIdStr);
      const activePJobs = pJobs.filter(j => ['pending', 'assigned', 'inProgress'].includes(j.status));
      const completedToday = pJobs.filter(j => j.status === 'completed' && j.completedAt >= todayStart && j.completedAt <= todayEnd);
      const overdueJobs = pJobs.filter(j => isJobOverdue(j));

      const dailyCapacity = p.operationalStatus?.dailyCapacity || 5;
      const remainingCapacity = Math.max(0, dailyCapacity - activePJobs.length);

      return {
        partnerId: p._id,
        partnerCode: p.partnerId,
        fullName: p.fullName,
        designation: p.designation || 'Partner',
        availability: p.operationalStatus?.availability || (p.isActive ? 'AVAILABLE' : 'INACTIVE'),
        dailyCapacity,
        activeJobsCount: activePJobs.length,
        completedTodayCount: completedToday.length,
        overdueCount: overdueJobs.length,
        remainingCapacity
      };
    });

    const activeSquadJobs = activeJobs.filter(j => ['pending', 'assigned', 'inProgress'].includes(j.status));
    const scheduledToday = activeJobs.filter(j => j.scheduledDate >= todayStart && j.scheduledDate <= todayEnd);
    const inProgress = activeJobs.filter(j => j.status === 'inProgress');
    const completedToday = activeJobs.filter(j => j.status === 'completed' && j.completedAt >= todayStart && j.completedAt <= todayEnd);
    const overdue = activeJobs.filter(j => isJobOverdue(j));

    res.status(200).json({
      statusCode: 200,
      message: 'Squad workload metrics fetched successfully',
      data: {
        team: {
          id: team._id,
          name: team.name,
          code: team.code
        },
        summary: {
          totalActiveJobs: activeSquadJobs.length,
          scheduledToday: scheduledToday.length,
          inProgress: inProgress.length,
          completedToday: completedToday.length,
          overdueJobs: overdue.length
        },
        partners: partnerWorkloadList
      }
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 43. OPERATIONAL SCHEDULE BOARD (PART 7)
 */
exports.getManagerScheduleBoard = async (req, res) => {
  try {
    const managerId = req.user?.id || req.user?._id;
    const { date, teamId, partnerId, status } = req.query;

    const manager = await Partner.findById(managerId).select('managerConfig');
    if (!manager || manager.managerConfig?.status !== 'ACTIVE') {
      return res.status(403).json({ statusCode: 403, message: 'Access denied: Manager is inactive' });
    }

    const managedTeamIds = (manager.managerConfig?.managedTeams || []).map(t => t.toString());

    // Teams validation
    const teams = await Team.find({
      managerId,
      _id: { $in: managedTeamIds }
    }).select('_id name code teamLeaderId');

    const teamIds = teams.map(t => t._id.toString());
    const teamMap = new Map();
    teams.forEach(t => teamMap.set(t._id.toString(), t));

    if (teamId && !teamIds.includes(teamId.toString())) {
      return res.status(403).json({ statusCode: 403, message: 'Access denied: Team outside your management scope' });
    }

    // Scoped partners
    const partners = await Partner.find({
      role: 'PARTNER',
      teamId: { $in: teamId ? [teamId] : teamIds },
      isDeleted: false
    }).select('_id fullName partnerId contactNumber teamId');

    const partnerIds = partners.map(p => p._id.toString());
    const partnerMap = new Map();
    partners.forEach(p => partnerMap.set(p._id.toString(), p));

    if (partnerId && !partnerIds.includes(partnerId.toString())) {
      return res.status(403).json({ statusCode: 403, message: 'Access denied: Partner outside your management scope' });
    }

    // Date range: defaults to today if not provided
    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const query = {
      assignedPartner: partnerId ? partnerId : { $in: partnerIds },
      scheduledDate: { $gte: startOfDay, $lte: endOfDay },
      status: { $ne: 'addToCart' }
    };

    if (status && status !== 'all') {
      query.status = status;
    }

    const scheduledJobs = await Cart.find(query)
      .populate('userId', 'firstName lastName fullName contactNumber')
      .populate('serviceId', 'serviceName serviceCost')
      .populate('assignedPartner', 'fullName partnerId contactNumber teamId')
      .sort({ scheduledStartTime: 1, createdAt: 1 });

    const scheduleItems = scheduledJobs.map(job => {
      const jObj = job.toObject();
      const p = job.assignedPartner ? partnerMap.get(job.assignedPartner._id.toString()) : null;
      const t = p?.teamId ? teamMap.get(p.teamId.toString()) : null;

      jObj.hierarchy = {
        team: t ? { id: t._id, name: t.name, code: t.code } : null,
        partner: p ? { id: p._id, name: p.fullName, partnerId: p.partnerId } : null
      };
      jObj.isOverdue = isJobOverdue(job);
      return jObj;
    });

    res.status(200).json({
      statusCode: 200,
      message: 'Operational schedule board fetched successfully',
      date: targetDate.toISOString().slice(0, 10),
      data: scheduleItems
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 44. TEAM LEADER SQUAD SCHEDULE BOARD (PART 7)
 */
exports.getTeamLeaderScheduleBoard = async (req, res) => {
  try {
    const leaderId = req.user?.id || req.user?._id;
    const { date, partnerId, status } = req.query;

    const leader = await Partner.findById(leaderId);
    const teamId = leader?.teamLeaderConfig?.teamId;
    if (!teamId) {
      return res.status(403).json({ statusCode: 403, message: 'Access denied: No active team' });
    }

    const partners = await Partner.find({ role: 'PARTNER', teamId, isDeleted: false }).select('_id fullName partnerId');
    const partnerIds = partners.map(p => p._id.toString());

    if (partnerId && !partnerIds.includes(partnerId.toString())) {
      return res.status(403).json({ statusCode: 403, message: 'Access denied: Partner is not in your squad' });
    }

    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const query = {
      assignedPartner: partnerId ? partnerId : { $in: partnerIds },
      scheduledDate: { $gte: startOfDay, $lte: endOfDay },
      status: { $ne: 'addToCart' }
    };

    if (status && status !== 'all') {
      query.status = status;
    }

    const jobs = await Cart.find(query)
      .populate('userId', 'firstName lastName fullName contactNumber')
      .populate('serviceId', 'serviceName serviceCost')
      .populate('assignedPartner', 'fullName partnerId contactNumber')
      .sort({ scheduledStartTime: 1 });

    const items = jobs.map(job => {
      const obj = job.toObject();
      obj.isOverdue = isJobOverdue(job);
      return obj;
    });

    res.status(200).json({
      statusCode: 200,
      message: 'Squad schedule board fetched successfully',
      date: targetDate.toISOString().slice(0, 10),
      data: items
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 45. GET PARTNER AVAILABILITY (PART 7)
 */
exports.getPartnerAvailability = async (req, res) => {
  try {
    const { partnerId } = req.params;
    const callerRole = normalizeRole(req.user?.role);
    const callerId = req.user?.id || req.user?._id;

    const partner = await Partner.findOne({ _id: partnerId, isDeleted: false })
      .select('_id fullName partnerId designation teamId operationalStatus isActive');

    if (!partner) {
      return res.status(404).json({ statusCode: 404, message: 'Partner not found' });
    }

    // Scope check
    if (callerRole === 'MANAGER') {
      const manager = await Partner.findById(callerId).select('managerConfig');
      const managedTeams = (manager?.managerConfig?.managedTeams || []).map(t => t.toString());
      if (!partner.teamId) {
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Partner has no team' });
      }
      const team = await Team.findById(partner.teamId);
      if (!team || team.managerId?.toString() !== callerId.toString() || !managedTeams.includes(team._id.toString())) {
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Partner outside your manager scope' });
      }
    } else if (callerRole === 'TEAM_LEADER') {
      const leader = await Partner.findById(callerId);
      const teamId = leader?.teamLeaderConfig?.teamId;
      if (!partner.teamId || partner.teamId.toString() !== teamId?.toString()) {
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Partner not in your squad' });
      }
    } else if (callerRole === 'PARTNER') {
      if (callerId.toString() !== partner._id.toString()) {
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Cannot view other partner availability' });
      }
    }

    res.status(200).json({
      statusCode: 200,
      data: {
        partnerId: partner._id,
        partnerCode: partner.partnerId,
        fullName: partner.fullName,
        availability: partner.operationalStatus?.availability || (partner.isActive ? 'AVAILABLE' : 'INACTIVE'),
        dailyCapacity: partner.operationalStatus?.dailyCapacity || 5,
        lastStatusUpdate: partner.operationalStatus?.lastStatusUpdate
      }
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 46. UPDATE PARTNER AVAILABILITY (PART 7)
 */
exports.updatePartnerAvailability = async (req, res) => {
  try {
    const { partnerId } = req.params;
    const { availability, dailyCapacity } = req.body;
    const callerRole = normalizeRole(req.user?.role);
    const callerId = req.user?.id || req.user?._id;

    const validAvailabilities = ['AVAILABLE', 'BUSY', 'OFFLINE', 'ON_LEAVE', 'INACTIVE'];
    if (availability && !validAvailabilities.includes(availability)) {
      return res.status(400).json({
        statusCode: 400,
        message: `Invalid availability state. Valid: ${validAvailabilities.join(', ')}`
      });
    }

    const partner = await Partner.findOne({ _id: partnerId, isDeleted: false });
    if (!partner) {
      return res.status(404).json({ statusCode: 404, message: 'Partner not found' });
    }

    // Scope check
    if (callerRole === 'MANAGER') {
      const manager = await Partner.findById(callerId).select('managerConfig');
      const managedTeams = (manager?.managerConfig?.managedTeams || []).map(t => t.toString());
      if (!partner.teamId) {
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Partner has no team' });
      }
      const team = await Team.findById(partner.teamId);
      if (!team || team.managerId?.toString() !== callerId.toString() || !managedTeams.includes(team._id.toString())) {
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Partner outside your manager scope' });
      }
    } else if (callerRole === 'TEAM_LEADER') {
      const leader = await Partner.findById(callerId);
      const teamId = leader?.teamLeaderConfig?.teamId;
      if (!partner.teamId || partner.teamId.toString() !== teamId?.toString()) {
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Partner not in your squad' });
      }
    } else if (callerRole === 'PARTNER') {
      if (callerId.toString() !== partner._id.toString()) {
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Cannot modify other partner availability' });
      }
    }

    if (!partner.operationalStatus) {
      partner.operationalStatus = {};
    }

    const prevAvailability = partner.operationalStatus.availability || (partner.isActive ? 'AVAILABLE' : 'INACTIVE');
    if (availability) partner.operationalStatus.availability = availability;
    if (dailyCapacity !== undefined && Number(dailyCapacity) > 0) partner.operationalStatus.dailyCapacity = Number(dailyCapacity);
    partner.operationalStatus.lastStatusUpdate = new Date();

    await partner.save();

    await ManagementAudit.create({
      action: 'PARTNER_AVAILABILITY_UPDATED',
      performedBy: {
        id: callerId,
        name: req.user?.fullName || req.user?.firstName || 'User',
        role: callerRole
      },
      targetUser: {
        id: partner._id,
        name: partner.fullName,
        partnerId: partner.partnerId,
        role: partner.role
      },
      details: {
        previousAvailability: prevAvailability,
        newAvailability: partner.operationalStatus.availability,
        dailyCapacity: partner.operationalStatus.dailyCapacity
      }
    });

    try {
      if (ably?.channels) {
        ably.channels.get(`partner-${partner._id}`).publish('partner_availability_updated', {
          partnerId: partner._id,
          availability: partner.operationalStatus.availability,
          dailyCapacity: partner.operationalStatus.dailyCapacity
        });
      }
    } catch (e) {
      console.warn('Real-time notification warning:', e.message);
    }

    res.status(200).json({
      statusCode: 200,
      message: `Partner availability updated to ${partner.operationalStatus.availability}`,
      data: {
        partnerId: partner._id,
        availability: partner.operationalStatus.availability,
        dailyCapacity: partner.operationalStatus.dailyCapacity,
        lastStatusUpdate: partner.operationalStatus.lastStatusUpdate
      }
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

exports.isJobOverdue = isJobOverdue;
exports.findScheduleConflict = findScheduleConflict;


// ==========================================
// PART 7: OPERATIONAL TRACKING, SCHEDULING & WORKLOAD
// ==========================================

/**
 * Helper: Centralized Overdue Calculation
 * A job is overdue when current time > scheduled end time (or end of scheduled day)
 * and status is NOT completed, cancelled, or addToCart.
 */
function isJobOverdue(job) {
  if (!job) return false;
  const status = (job.status || '').toUpperCase();
  if (['COMPLETED', 'CANCELLED', 'ADDTOCART'].includes(status)) {
    return false;
  }
  if (!job.scheduledDate) {
    return false;
  }
  const now = new Date();
  const scheduled = new Date(job.scheduledDate);

  if (job.scheduledEndTime) {
    const parts = job.scheduledEndTime.split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    if (!isNaN(hours) && !isNaN(minutes)) {
      scheduled.setHours(hours, minutes, 0, 0);
      return now > scheduled;
    }
  }

  // Date-only rule: overdue if now is past the end of the scheduled calendar day
  scheduled.setHours(23, 59, 59, 999);
  return now > scheduled;
}

/**
 * Helper: Schedule Conflict Detection
 * Checks if the partner already has another active job scheduled during the specified time window.
 */
async function findScheduleConflict(partnerId, scheduledDate, startTime, endTime, excludeRequestId = null, session = null) {
  if (!partnerId || !scheduledDate || !startTime || !endTime) {
    return null;
  }

  const startOfDay = new Date(scheduledDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(scheduledDate);
  endOfDay.setHours(23, 59, 59, 999);

  const query = {
    assignedPartner: partnerId,
    status: { $in: ['pending', 'assigned', 'inProgress', 'PENDING', 'ASSIGNED', 'IN_PROGRESS', 'ACCEPTED', 'accepted'] },
    scheduledDate: { $gte: startOfDay, $lte: endOfDay },
    scheduledStartTime: { $exists: true, $ne: '' },
    scheduledEndTime: { $exists: true, $ne: '' }
  };

  if (excludeRequestId) {
    query._id = { $ne: excludeRequestId };
  }

  let reqQuery = Cart.find(query).select('orderId scheduledDate scheduledStartTime scheduledEndTime serviceName');
  if (session) reqQuery = reqQuery.session(session);
  const existingJobs = await reqQuery;

  for (const job of existingJobs) {
    // Overlapping intervals check: (StartA < EndB) && (EndA > StartB)
    if (startTime < job.scheduledEndTime && endTime > job.scheduledStartTime) {
      return job;
    }
  }
  return null;
}

/**
 * 40. RESCHEDULE SERVICE REQUEST / JOB (PART 7)
 * Strictly validates request status, manager scope, and schedule conflict.
 * Uses atomic MongoDB transaction/session.
 */
exports.rescheduleJob = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { requestId } = req.params;
    const { scheduledDate, scheduledStartTime, scheduledEndTime, reason = '' } = req.body;
    const callerRole = normalizeRole(req.user?.role);
    const callerId = req.user?.id || req.user?._id;

    if (!scheduledDate) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ statusCode: 400, message: 'scheduledDate is required for rescheduling' });
    }

    const request = await Cart.findById(requestId).session(session);
    if (!request) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ statusCode: 404, message: 'Service request not found' });
    }

    // 1. Status Check: Completed or Cancelled jobs cannot be rescheduled
    if (['completed', 'cancelled'].includes(request.status)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        statusCode: 400,
        message: `Cannot reschedule: Service request is already ${request.status} and cannot be modified.`
      });
    }

    // 2. Manager Scope Validation
    if (callerRole === 'MANAGER') {
      const manager = await Partner.findById(callerId).select('managerConfig').session(session);
      const managedTeams = (manager?.managerConfig?.managedTeams || []).map(t => t.toString());

      if (request.assignedPartner) {
        const partner = await Partner.findById(request.assignedPartner).session(session);
        const team = partner?.teamId ? await Team.findById(partner.teamId).session(session) : null;
        if (!team || team.managerId?.toString() !== callerId.toString() || !managedTeams.includes(team._id.toString())) {
          await session.abortTransaction();
          session.endSession();
          return res.status(403).json({
            statusCode: 403,
            message: 'Access denied: Request belongs to a partner/team outside your management scope'
          });
        }
      } else {
        // Unassigned request scope
        const managedCategories = (manager?.managerConfig?.managedCategories || []).map(c => c.toString());
        const managedAreas = (manager?.managerConfig?.managedAreas || []).map(a => a.toString());
        const hubs = await Hub.find({ _id: { $in: managedAreas } }).select('name pincodes').session(session);
        const hubNames = hubs.map(h => h.name);
        const allPincodes = hubs.flatMap(h => h.pincodes || []);

        const matchesCat = request.mainServiceId && managedCategories.includes(request.mainServiceId.toString());
        const matchesArea = (request.deliveryAddress?.postalCode && allPincodes.includes(request.deliveryAddress.postalCode)) ||
                            (request.deliveryAddress?.city && hubNames.includes(request.deliveryAddress.city));

        if (!matchesCat && !matchesArea) {
          await session.abortTransaction();
          session.endSession();
          return res.status(403).json({
            statusCode: 403,
            message: 'Access denied: Unassigned request is outside your operational scope'
          });
        }
      }
    } else if (callerRole === 'TEAM_LEADER') {
      const leader = await Partner.findById(callerId).session(session);
      const teamId = leader?.teamLeaderConfig?.teamId;
      if (!teamId) {
        await session.abortTransaction();
        session.endSession();
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Team Leader has no assigned team' });
      }
      const team = await Team.findById(teamId).session(session);
      const memberIds = (team?.members || []).map(m => m.toString());
      if (!request.assignedPartner || !memberIds.includes(request.assignedPartner.toString())) {
        await session.abortTransaction();
        session.endSession();
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Request is not assigned to your squad members' });
      }
    }

    // 3. Schedule Conflict Detection
    if (request.assignedPartner && scheduledStartTime && scheduledEndTime) {
      const conflict = await findScheduleConflict(
        request.assignedPartner,
        scheduledDate,
        scheduledStartTime,
        scheduledEndTime,
        request._id,
        session
      );

      if (conflict) {
        await session.abortTransaction();
        session.endSession();
        return res.status(409).json({
          statusCode: 409,
          error: 'SCHEDULE_CONFLICT',
          message: 'Scheduling conflict: Partner already has another job scheduled during this time window.',
          conflict: {
            conflictingOrderId: conflict.orderId || conflict._id,
            scheduledDate: conflict.scheduledDate,
            scheduledStartTime: conflict.scheduledStartTime,
            scheduledEndTime: conflict.scheduledEndTime,
            serviceName: conflict.serviceName
          }
        });
      }
    }

    // 4. Update Schedule & Tracking
    const oldScheduleStr = request.scheduledDate
      ? `${new Date(request.scheduledDate).toLocaleDateString()} ${request.scheduledStartTime || ''}-${request.scheduledEndTime || ''}`.trim()
      : 'Unscheduled';

    const newScheduleStr = `${new Date(scheduledDate).toLocaleDateString()} ${scheduledStartTime || ''}-${scheduledEndTime || ''}`.trim();

    const trackingMsg = reason
      ? `Job rescheduled from ${oldScheduleStr} to ${newScheduleStr}. Reason: ${reason}`
      : `Job rescheduled from ${oldScheduleStr} to ${newScheduleStr}`;

    const updateFields = {
      scheduledDate: new Date(scheduledDate)
    };
    if (scheduledStartTime !== undefined) updateFields.scheduledStartTime = scheduledStartTime;
    if (scheduledEndTime !== undefined) updateFields.scheduledEndTime = scheduledEndTime;

    const updatedRequest = await Cart.findByIdAndUpdate(
      requestId,
      {
        $set: updateFields,
        $push: {
          tracking: {
            message: trackingMsg,
            status: request.status,
            date: new Date()
          }
        }
      },
      { new: true, session }
    );

    // 5. Audit Logging inside transaction
    await ManagementAudit.create([
      {
        action: 'JOB_RESCHEDULED',
        performedBy: {
          id: callerId,
          name: req.user?.fullName || req.user?.firstName || 'Manager',
          role: callerRole
        },
        targetUser: {
          id: request.assignedPartner || null,
          name: '',
          partnerId: '',
          role: 'PARTNER'
        },
        details: {
          requestId: request._id,
          orderId: request.orderId,
          previousSchedule: oldScheduleStr,
          newSchedule: newScheduleStr,
          reason: reason || 'Operational rescheduling'
        }
      }
    ], { session });

    await session.commitTransaction();
    session.endSession();

    // 6. Real-time event
    try {
      if (ably?.channels) {
        if (request.assignedPartner) {
          ably.channels.get(`partner-${request.assignedPartner}`).publish('job_rescheduled', {
            message: `Task ${updatedRequest.orderId || updatedRequest._id} rescheduled to ${newScheduleStr}`,
            taskId: updatedRequest._id,
            scheduledDate: updatedRequest.scheduledDate,
            scheduledStartTime: updatedRequest.scheduledStartTime,
            scheduledEndTime: updatedRequest.scheduledEndTime
          });
        }
        ably.channels.get('admin-channel').publish('task_updated', {
          message: `Task ${updatedRequest.orderId || updatedRequest._id} rescheduled`,
          taskId: updatedRequest._id
        });
      }
    } catch (e) {
      console.warn('Real-time notify warning:', e.message);
    }

    res.status(200).json({
      statusCode: 200,
      message: `Service request successfully rescheduled to ${newScheduleStr}`,
      data: {
        requestId: updatedRequest._id,
        orderId: updatedRequest.orderId,
        scheduledDate: updatedRequest.scheduledDate,
        scheduledStartTime: updatedRequest.scheduledStartTime,
        scheduledEndTime: updatedRequest.scheduledEndTime,
        status: updatedRequest.status
      }
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 41. MANAGER OPERATIONAL WORKLOAD & PERFORMANCE METRICS (PART 7)
 */
exports.getManagerWorkload = async (req, res) => {
  try {
    const managerId = req.user?.id || req.user?._id;
    const manager = await Partner.findById(managerId)
      .populate('managerConfig.managedCategories', 'serviceName serviceHeading')
      .populate('managerConfig.managedAreas', 'name pincodes');

    if (!manager) {
      return res.status(404).json({ statusCode: 404, message: 'Manager not found' });
    }

    const managedTeamIds = (manager.managerConfig?.managedTeams || []).map(t => t.toString());

    // Teams belonging to manager
    const teams = await Team.find({
      managerId,
      _id: { $in: managedTeamIds }
    }).select('_id name code status teamLeaderId categories areas members');

    const teamIds = teams.map(t => t._id);

    // Team Leaders under manager
    const teamLeaders = await Partner.find({
      role: 'TEAM_LEADER',
      'teamLeaderConfig.managerId': managerId,
      isDeleted: false
    }).select('_id fullName partnerId email contactNumber teamLeaderConfig');

    const leaderMap = new Map();
    teamLeaders.forEach(l => leaderMap.set(l._id.toString(), l));

    // Partners belonging to these teams
    const partners = await Partner.find({
      role: 'PARTNER',
      teamId: { $in: teamIds },
      isDeleted: false
    }).select('_id fullName partnerId email contactNumber designation hub expertise teamId operationalStatus isActive');

    const partnerIds = partners.map(p => p._id);
    const partnerMap = new Map();
    partners.forEach(p => partnerMap.set(p._id.toString(), p));

    // Time boundaries for Today in IST
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Fetch active & relevant scoped jobs
    const activeJobs = await Cart.find({
      assignedPartner: { $in: partnerIds },
      status: { $in: ['pending', 'assigned', 'inProgress', 'completed'] }
    }).select('_id orderId serviceName status assignedPartner scheduledDate scheduledStartTime scheduledEndTime createdAt completedAt');

    // Build unassigned queries
    const managedCategories = manager.managerConfig?.managedCategories || [];
    const categoryIds = managedCategories.map(c => c._id.toString());
    const categoryHeadings = managedCategories.flatMap(c => [c.serviceName, c.serviceHeading].filter(Boolean));
    const managedAreas = manager.managerConfig?.managedAreas || [];
    const hubNames = managedAreas.map(a => a.name);
    const hubPincodes = managedAreas.flatMap(a => a.pincodes || []);

    const unassignedScopeConditions = [];
    if (categoryIds.length > 0) unassignedScopeConditions.push({ mainServiceId: { $in: categoryIds } });
    if (categoryHeadings.length > 0) unassignedScopeConditions.push({ serviceName: { $in: categoryHeadings.map(h => new RegExp(h, 'i')) } });
    if (hubPincodes.length > 0) unassignedScopeConditions.push({ 'deliveryAddress.postalCode': { $in: hubPincodes } });
    if (hubNames.length > 0) unassignedScopeConditions.push({ 'deliveryAddress.city': { $in: hubNames.map(n => new RegExp(n, 'i')) } });

    const unassignedCount = await Cart.countDocuments({
      status: { $ne: 'addToCart' },
      $and: [
        {
          $or: [
            { assignedPartner: null },
            { assignedPartner: { $exists: false } }
          ]
        },
        ...(unassignedScopeConditions.length > 0 ? [{ $or: unassignedScopeConditions }] : [])
      ]
    });

    // Partner-level workload calculation
    const partnerWorkloadMap = new Map();
    partners.forEach(p => {
      const pIdStr = p._id.toString();
      const pJobs = activeJobs.filter(j => j.assignedPartner?.toString() === pIdStr);
      const activePJobs = pJobs.filter(j => ['pending', 'assigned', 'inProgress'].includes(j.status));
      const completedToday = pJobs.filter(j => j.status === 'completed' && j.completedAt >= todayStart && j.completedAt <= todayEnd);
      const overdueJobs = pJobs.filter(j => isJobOverdue(j));

      const dailyCapacity = p.operationalStatus?.dailyCapacity || 5;
      const remainingCapacity = Math.max(0, dailyCapacity - activePJobs.length);
      const isOverloaded = activePJobs.length >= dailyCapacity;

      partnerWorkloadMap.set(pIdStr, {
        partnerId: p._id,
        partnerCode: p.partnerId,
        fullName: p.fullName,
        designation: p.designation || 'Partner',
        teamId: p.teamId,
        isActive: p.isActive,
        availability: p.operationalStatus?.availability || (p.isActive ? 'AVAILABLE' : 'INACTIVE'),
        dailyCapacity,
        activeJobsCount: activePJobs.length,
        completedTodayCount: completedToday.length,
        overdueCount: overdueJobs.length,
        remainingCapacity,
        isOverloaded
      });
    });

    // Team-level workload aggregation
    const teamWorkloadList = teams.map(team => {
      const tIdStr = team._id.toString();
      const teamPartners = partners.filter(p => p.teamId?.toString() === tIdStr);
      const teamPartnerIds = teamPartners.map(p => p._id.toString());

      const teamJobs = activeJobs.filter(j => teamPartnerIds.includes(j.assignedPartner?.toString()));
      const activeTeamJobs = teamJobs.filter(j => ['pending', 'assigned', 'inProgress'].includes(j.status));
      const scheduledToday = teamJobs.filter(j => j.scheduledDate >= todayStart && j.scheduledDate <= todayEnd);
      const inProgress = teamJobs.filter(j => j.status === 'inProgress');
      const completedToday = teamJobs.filter(j => j.status === 'completed' && j.completedAt >= todayStart && j.completedAt <= todayEnd);
      const overdue = teamJobs.filter(j => isJobOverdue(j));

      const availablePartners = teamPartners.filter(p => (p.operationalStatus?.availability || 'AVAILABLE') === 'AVAILABLE' && p.isActive).length;
      const busyPartners = teamPartners.filter(p => (p.operationalStatus?.availability) === 'BUSY').length;

      let leaderInfo = null;
      if (team.teamLeaderId && leaderMap.has(team.teamLeaderId.toString())) {
        const l = leaderMap.get(team.teamLeaderId.toString());
        leaderInfo = { id: l._id, fullName: l.fullName, partnerId: l.partnerId };
      }

      return {
        teamId: team._id,
        name: team.name,
        code: team.code,
        status: team.status,
        teamLeader: leaderInfo,
        totalPartners: teamPartners.length,
        availablePartners,
        busyPartners,
        activeJobsCount: activeTeamJobs.length,
        scheduledTodayCount: scheduledToday.length,
        inProgressCount: inProgress.length,
        completedTodayCount: completedToday.length,
        overdueCount: overdue.length
      };
    });

    // Global summary
    const allActiveJobs = activeJobs.filter(j => ['pending', 'assigned', 'inProgress'].includes(j.status));
    const allTodayScheduled = activeJobs.filter(j => j.scheduledDate >= todayStart && j.scheduledDate <= todayEnd);
    const allInProgress = activeJobs.filter(j => j.status === 'inProgress');
    const allCompletedToday = activeJobs.filter(j => j.status === 'completed' && j.completedAt >= todayStart && j.completedAt <= todayEnd);
    const allOverdue = activeJobs.filter(j => isJobOverdue(j));

    res.status(200).json({
      statusCode: 200,
      message: 'Manager operational workload metrics fetched successfully',
      data: {
        summary: {
          totalActiveJobs: allActiveJobs.length,
          scheduledToday: allTodayScheduled.length,
          inProgress: allInProgress.length,
          completedToday: allCompletedToday.length,
          overdueJobs: allOverdue.length,
          unassignedJobs: unassignedCount
        },
        teams: teamWorkloadList,
        partners: Array.from(partnerWorkloadMap.values())
      }
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 42. TEAM LEADER SQUAD WORKLOAD (PART 7)
 */
exports.getTeamLeaderWorkload = async (req, res) => {
  try {
    const leaderId = req.user?.id || req.user?._id;
    const leader = await Partner.findById(leaderId);
    if (!leader || leader.teamLeaderConfig?.status !== 'ACTIVE') {
      return res.status(403).json({ statusCode: 403, message: 'Access denied: Team Leader is inactive' });
    }

    const teamId = leader.teamLeaderConfig?.teamId;
    if (!teamId) {
      return res.status(403).json({ statusCode: 403, message: 'Access denied: No active team assignment' });
    }

    const team = await Team.findById(teamId).select('name code status');
    const partners = await Partner.find({
      role: 'PARTNER',
      teamId,
      isDeleted: false
    }).select('_id fullName partnerId designation expertise operationalStatus isActive');

    const partnerIds = partners.map(p => p._id);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const activeJobs = await Cart.find({
      assignedPartner: { $in: partnerIds },
      status: { $in: ['pending', 'assigned', 'inProgress', 'completed'] }
    }).select('_id orderId serviceName status assignedPartner scheduledDate scheduledStartTime scheduledEndTime completedAt');

    const partnerWorkloadList = partners.map(p => {
      const pIdStr = p._id.toString();
      const pJobs = activeJobs.filter(j => j.assignedPartner?.toString() === pIdStr);
      const activePJobs = pJobs.filter(j => ['pending', 'assigned', 'inProgress'].includes(j.status));
      const completedToday = pJobs.filter(j => j.status === 'completed' && j.completedAt >= todayStart && j.completedAt <= todayEnd);
      const overdueJobs = pJobs.filter(j => isJobOverdue(j));

      const dailyCapacity = p.operationalStatus?.dailyCapacity || 5;
      const remainingCapacity = Math.max(0, dailyCapacity - activePJobs.length);

      return {
        partnerId: p._id,
        partnerCode: p.partnerId,
        fullName: p.fullName,
        designation: p.designation || 'Partner',
        availability: p.operationalStatus?.availability || (p.isActive ? 'AVAILABLE' : 'INACTIVE'),
        dailyCapacity,
        activeJobsCount: activePJobs.length,
        completedTodayCount: completedToday.length,
        overdueCount: overdueJobs.length,
        remainingCapacity
      };
    });

    const activeSquadJobs = activeJobs.filter(j => ['pending', 'assigned', 'inProgress'].includes(j.status));
    const scheduledToday = activeJobs.filter(j => j.scheduledDate >= todayStart && j.scheduledDate <= todayEnd);
    const inProgress = activeJobs.filter(j => j.status === 'inProgress');
    const completedToday = activeJobs.filter(j => j.status === 'completed' && j.completedAt >= todayStart && j.completedAt <= todayEnd);
    const overdue = activeJobs.filter(j => isJobOverdue(j));

    res.status(200).json({
      statusCode: 200,
      message: 'Squad workload metrics fetched successfully',
      data: {
        team: {
          id: team._id,
          name: team.name,
          code: team.code
        },
        summary: {
          totalActiveJobs: activeSquadJobs.length,
          scheduledToday: scheduledToday.length,
          inProgress: inProgress.length,
          completedToday: completedToday.length,
          overdueJobs: overdue.length
        },
        partners: partnerWorkloadList
      }
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 43. OPERATIONAL SCHEDULE BOARD (PART 7)
 */
exports.getManagerScheduleBoard = async (req, res) => {
  try {
    const managerId = req.user?.id || req.user?._id;
    const { date, teamId, partnerId, status } = req.query;

    const manager = await Partner.findById(managerId).select('managerConfig');
    if (!manager || manager.managerConfig?.status !== 'ACTIVE') {
      return res.status(403).json({ statusCode: 403, message: 'Access denied: Manager is inactive' });
    }

    const managedTeamIds = (manager.managerConfig?.managedTeams || []).map(t => t.toString());

    // Teams validation
    const teams = await Team.find({
      managerId,
      _id: { $in: managedTeamIds }
    }).select('_id name code teamLeaderId');

    const teamIds = teams.map(t => t._id.toString());
    const teamMap = new Map();
    teams.forEach(t => teamMap.set(t._id.toString(), t));

    if (teamId && !teamIds.includes(teamId.toString())) {
      return res.status(403).json({ statusCode: 403, message: 'Access denied: Team outside your management scope' });
    }

    // Scoped partners
    const partners = await Partner.find({
      role: 'PARTNER',
      teamId: { $in: teamId ? [teamId] : teamIds },
      isDeleted: false
    }).select('_id fullName partnerId contactNumber teamId');

    const partnerIds = partners.map(p => p._id.toString());
    const partnerMap = new Map();
    partners.forEach(p => partnerMap.set(p._id.toString(), p));

    if (partnerId && !partnerIds.includes(partnerId.toString())) {
      return res.status(403).json({ statusCode: 403, message: 'Access denied: Partner outside your management scope' });
    }

    // Date range: defaults to today if not provided
    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const query = {
      assignedPartner: partnerId ? partnerId : { $in: partnerIds },
      scheduledDate: { $gte: startOfDay, $lte: endOfDay },
      status: { $ne: 'addToCart' }
    };

    if (status && status !== 'all') {
      query.status = status;
    }

    const scheduledJobs = await Cart.find(query)
      .populate('userId', 'firstName lastName fullName contactNumber')
      .populate('serviceId', 'serviceName serviceCost')
      .populate('assignedPartner', 'fullName partnerId contactNumber teamId')
      .sort({ scheduledStartTime: 1, createdAt: 1 });

    const scheduleItems = scheduledJobs.map(job => {
      const jObj = job.toObject();
      const p = job.assignedPartner ? partnerMap.get(job.assignedPartner._id.toString()) : null;
      const t = p?.teamId ? teamMap.get(p.teamId.toString()) : null;

      jObj.hierarchy = {
        team: t ? { id: t._id, name: t.name, code: t.code } : null,
        partner: p ? { id: p._id, name: p.fullName, partnerId: p.partnerId } : null
      };
      jObj.isOverdue = isJobOverdue(job);
      return jObj;
    });

    res.status(200).json({
      statusCode: 200,
      message: 'Operational schedule board fetched successfully',
      date: targetDate.toISOString().slice(0, 10),
      data: scheduleItems
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 44. TEAM LEADER SQUAD SCHEDULE BOARD (PART 7)
 */
exports.getTeamLeaderScheduleBoard = async (req, res) => {
  try {
    const leaderId = req.user?.id || req.user?._id;
    const { date, partnerId, status } = req.query;

    const leader = await Partner.findById(leaderId);
    const teamId = leader?.teamLeaderConfig?.teamId;
    if (!teamId) {
      return res.status(403).json({ statusCode: 403, message: 'Access denied: No active team' });
    }

    const partners = await Partner.find({ role: 'PARTNER', teamId, isDeleted: false }).select('_id fullName partnerId');
    const partnerIds = partners.map(p => p._id.toString());

    if (partnerId && !partnerIds.includes(partnerId.toString())) {
      return res.status(403).json({ statusCode: 403, message: 'Access denied: Partner is not in your squad' });
    }

    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const query = {
      assignedPartner: partnerId ? partnerId : { $in: partnerIds },
      scheduledDate: { $gte: startOfDay, $lte: endOfDay },
      status: { $ne: 'addToCart' }
    };

    if (status && status !== 'all') {
      query.status = status;
    }

    const jobs = await Cart.find(query)
      .populate('userId', 'firstName lastName fullName contactNumber')
      .populate('serviceId', 'serviceName serviceCost')
      .populate('assignedPartner', 'fullName partnerId contactNumber')
      .sort({ scheduledStartTime: 1 });

    const items = jobs.map(job => {
      const obj = job.toObject();
      obj.isOverdue = isJobOverdue(job);
      return obj;
    });

    res.status(200).json({
      statusCode: 200,
      message: 'Squad schedule board fetched successfully',
      date: targetDate.toISOString().slice(0, 10),
      data: items
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 45. GET PARTNER AVAILABILITY (PART 7)
 */
exports.getPartnerAvailability = async (req, res) => {
  try {
    const { partnerId } = req.params;
    const callerRole = normalizeRole(req.user?.role);
    const callerId = req.user?.id || req.user?._id;

    const partner = await Partner.findOne({ _id: partnerId, isDeleted: false })
      .select('_id fullName partnerId designation teamId operationalStatus isActive');

    if (!partner) {
      return res.status(404).json({ statusCode: 404, message: 'Partner not found' });
    }

    // Scope check
    if (callerRole === 'MANAGER') {
      const manager = await Partner.findById(callerId).select('managerConfig');
      const managedTeams = (manager?.managerConfig?.managedTeams || []).map(t => t.toString());
      if (!partner.teamId) {
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Partner has no team' });
      }
      const team = await Team.findById(partner.teamId);
      if (!team || team.managerId?.toString() !== callerId.toString() || !managedTeams.includes(team._id.toString())) {
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Partner outside your manager scope' });
      }
    } else if (callerRole === 'TEAM_LEADER') {
      const leader = await Partner.findById(callerId);
      const teamId = leader?.teamLeaderConfig?.teamId;
      if (!partner.teamId || partner.teamId.toString() !== teamId?.toString()) {
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Partner not in your squad' });
      }
    } else if (callerRole === 'PARTNER') {
      if (callerId.toString() !== partner._id.toString()) {
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Cannot view other partner availability' });
      }
    }

    res.status(200).json({
      statusCode: 200,
      data: {
        partnerId: partner._id,
        partnerCode: partner.partnerId,
        fullName: partner.fullName,
        availability: partner.operationalStatus?.availability || (partner.isActive ? 'AVAILABLE' : 'INACTIVE'),
        dailyCapacity: partner.operationalStatus?.dailyCapacity || 5,
        lastStatusUpdate: partner.operationalStatus?.lastStatusUpdate
      }
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 46. UPDATE PARTNER AVAILABILITY (PART 7)
 */
exports.updatePartnerAvailability = async (req, res) => {
  try {
    const { partnerId } = req.params;
    const { availability, dailyCapacity } = req.body;
    const callerRole = normalizeRole(req.user?.role);
    const callerId = req.user?.id || req.user?._id;

    const validAvailabilities = ['AVAILABLE', 'BUSY', 'OFFLINE', 'ON_LEAVE', 'INACTIVE'];
    if (availability && !validAvailabilities.includes(availability)) {
      return res.status(400).json({
        statusCode: 400,
        message: `Invalid availability state. Valid: ${validAvailabilities.join(', ')}`
      });
    }

    const partner = await Partner.findOne({ _id: partnerId, isDeleted: false });
    if (!partner) {
      return res.status(404).json({ statusCode: 404, message: 'Partner not found' });
    }

    // Scope check
    if (callerRole === 'MANAGER') {
      const manager = await Partner.findById(callerId).select('managerConfig');
      const managedTeams = (manager?.managerConfig?.managedTeams || []).map(t => t.toString());
      if (!partner.teamId) {
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Partner has no team' });
      }
      const team = await Team.findById(partner.teamId);
      if (!team || team.managerId?.toString() !== callerId.toString() || !managedTeams.includes(team._id.toString())) {
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Partner outside your manager scope' });
      }
    } else if (callerRole === 'TEAM_LEADER') {
      const leader = await Partner.findById(callerId);
      const teamId = leader?.teamLeaderConfig?.teamId;
      if (!partner.teamId || partner.teamId.toString() !== teamId?.toString()) {
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Partner not in your squad' });
      }
    } else if (callerRole === 'PARTNER') {
      if (callerId.toString() !== partner._id.toString()) {
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Cannot modify other partner availability' });
      }
    }

    if (!partner.operationalStatus) {
      partner.operationalStatus = {};
    }

    const prevAvailability = partner.operationalStatus.availability || (partner.isActive ? 'AVAILABLE' : 'INACTIVE');
    if (availability) partner.operationalStatus.availability = availability;
    if (dailyCapacity !== undefined && Number(dailyCapacity) > 0) partner.operationalStatus.dailyCapacity = Number(dailyCapacity);
    partner.operationalStatus.lastStatusUpdate = new Date();

    await partner.save();

    await ManagementAudit.create({
      action: 'PARTNER_AVAILABILITY_UPDATED',
      performedBy: {
        id: callerId,
        name: req.user?.fullName || req.user?.firstName || 'User',
        role: callerRole
      },
      targetUser: {
        id: partner._id,
        name: partner.fullName,
        partnerId: partner.partnerId,
        role: partner.role
      },
      details: {
        previousAvailability: prevAvailability,
        newAvailability: partner.operationalStatus.availability,
        dailyCapacity: partner.operationalStatus.dailyCapacity
      }
    });

    try {
      if (ably?.channels) {
        ably.channels.get(`partner-${partner._id}`).publish('partner_availability_updated', {
          partnerId: partner._id,
          availability: partner.operationalStatus.availability,
          dailyCapacity: partner.operationalStatus.dailyCapacity
        });
      }
    } catch (e) {
      console.warn('Real-time notification warning:', e.message);
    }

    res.status(200).json({
      statusCode: 200,
      message: `Partner availability updated to ${partner.operationalStatus.availability}`,
      data: {
        partnerId: partner._id,
        availability: partner.operationalStatus.availability,
        dailyCapacity: partner.operationalStatus.dailyCapacity,
        lastStatusUpdate: partner.operationalStatus.lastStatusUpdate
      }
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

exports.isJobOverdue = isJobOverdue;
exports.findScheduleConflict = findScheduleConflict;


// ==========================================
// PART 7: OPERATIONAL TRACKING, SCHEDULING & WORKLOAD
// ==========================================

/**
 * Helper: Centralized Overdue Calculation
 * A job is overdue when current time > scheduled end time (or end of scheduled day)
 * and status is NOT completed, cancelled, or addToCart.
 */
function isJobOverdue(job) {
  if (!job) return false;
  const status = (job.status || '').toUpperCase();
  if (['COMPLETED', 'CANCELLED', 'ADDTOCART'].includes(status)) {
    return false;
  }
  if (!job.scheduledDate) {
    return false;
  }
  const now = new Date();
  const scheduled = new Date(job.scheduledDate);

  if (job.scheduledEndTime) {
    const parts = job.scheduledEndTime.split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    if (!isNaN(hours) && !isNaN(minutes)) {
      scheduled.setHours(hours, minutes, 0, 0);
      return now > scheduled;
    }
  }

  // Date-only rule: overdue if now is past the end of the scheduled calendar day
  scheduled.setHours(23, 59, 59, 999);
  return now > scheduled;
}

/**
 * Helper: Schedule Conflict Detection
 * Checks if the partner already has another active job scheduled during the specified time window.
 */
async function findScheduleConflict(partnerId, scheduledDate, startTime, endTime, excludeRequestId = null, session = null) {
  if (!partnerId || !scheduledDate || !startTime || !endTime) {
    return null;
  }

  const startOfDay = new Date(scheduledDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(scheduledDate);
  endOfDay.setHours(23, 59, 59, 999);

  const query = {
    assignedPartner: partnerId,
    status: { $in: ['pending', 'assigned', 'inProgress', 'PENDING', 'ASSIGNED', 'IN_PROGRESS', 'ACCEPTED', 'accepted'] },
    scheduledDate: { $gte: startOfDay, $lte: endOfDay },
    scheduledStartTime: { $exists: true, $ne: '' },
    scheduledEndTime: { $exists: true, $ne: '' }
  };

  if (excludeRequestId) {
    query._id = { $ne: excludeRequestId };
  }

  let reqQuery = Cart.find(query).select('orderId scheduledDate scheduledStartTime scheduledEndTime serviceName');
  if (session) reqQuery = reqQuery.session(session);
  const existingJobs = await reqQuery;

  for (const job of existingJobs) {
    // Overlapping intervals check: (StartA < EndB) && (EndA > StartB)
    if (startTime < job.scheduledEndTime && endTime > job.scheduledStartTime) {
      return job;
    }
  }
  return null;
}

/**
 * 40. RESCHEDULE SERVICE REQUEST / JOB (PART 7)
 * Strictly validates request status, manager scope, and schedule conflict.
 * Uses atomic MongoDB transaction/session.
 */
exports.rescheduleJob = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { requestId } = req.params;
    const { scheduledDate, scheduledStartTime, scheduledEndTime, reason = '' } = req.body;
    const callerRole = normalizeRole(req.user?.role);
    const callerId = req.user?.id || req.user?._id;

    if (!scheduledDate) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ statusCode: 400, message: 'scheduledDate is required for rescheduling' });
    }

    const request = await Cart.findById(requestId).session(session);
    if (!request) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ statusCode: 404, message: 'Service request not found' });
    }

    // 1. Status Check: Completed or Cancelled jobs cannot be rescheduled
    const reqStatus = (request.status || '').toUpperCase();
    if (['COMPLETED', 'CANCELLED'].includes(reqStatus)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        statusCode: 400,
        message: `Cannot reschedule: Service request is already ${request.status} and cannot be modified.`
      });
    }

    // 2. Manager Scope Validation
    if (callerRole === 'MANAGER') {
      const manager = await Partner.findById(callerId).select('managerConfig').session(session);
      const managedTeams = (manager?.managerConfig?.managedTeams || []).map(t => t.toString());

      if (request.assignedPartner) {
        const partner = await Partner.findById(request.assignedPartner).session(session);
        const team = partner?.teamId ? await Team.findById(partner.teamId).session(session) : null;
        if (!team || team.managerId?.toString() !== callerId.toString() || !managedTeams.includes(team._id.toString())) {
          await session.abortTransaction();
          session.endSession();
          return res.status(403).json({
            statusCode: 403,
            message: 'Access denied: Request belongs to a partner/team outside your management scope'
          });
        }
      } else {
        // Unassigned request scope
        const managedCategories = (manager?.managerConfig?.managedCategories || []).map(c => c.toString());
        const managedAreas = (manager?.managerConfig?.managedAreas || []).map(a => a.toString());
        const hubs = await Hub.find({ _id: { $in: managedAreas } }).select('name pincodes').session(session);
        const hubNames = hubs.map(h => h.name);
        const allPincodes = hubs.flatMap(h => h.pincodes || []);

        const matchesCat = request.mainServiceId && managedCategories.includes(request.mainServiceId.toString());
        const matchesArea = (request.deliveryAddress?.postalCode && allPincodes.includes(request.deliveryAddress.postalCode)) ||
                            (request.deliveryAddress?.city && hubNames.includes(request.deliveryAddress.city));

        if (!matchesCat && !matchesArea) {
          await session.abortTransaction();
          session.endSession();
          return res.status(403).json({
            statusCode: 403,
            message: 'Access denied: Unassigned request is outside your operational scope'
          });
        }
      }
    } else if (callerRole === 'TEAM_LEADER') {
      const leader = await Partner.findById(callerId).session(session);
      const teamId = leader?.teamLeaderConfig?.teamId;
      if (!teamId) {
        await session.abortTransaction();
        session.endSession();
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Team Leader has no assigned team' });
      }
      const team = await Team.findById(teamId).session(session);
      const memberIds = (team?.members || []).map(m => m.toString());
      if (!request.assignedPartner || !memberIds.includes(request.assignedPartner.toString())) {
        await session.abortTransaction();
        session.endSession();
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Request is not assigned to your squad members' });
      }
    }

    // 3. Schedule Conflict Detection
    if (request.assignedPartner && scheduledStartTime && scheduledEndTime) {
      const conflict = await findScheduleConflict(
        request.assignedPartner,
        scheduledDate,
        scheduledStartTime,
        scheduledEndTime,
        request._id,
        session
      );

      if (conflict) {
        await session.abortTransaction();
        session.endSession();
        return res.status(409).json({
          statusCode: 409,
          error: 'SCHEDULE_CONFLICT',
          message: 'Scheduling conflict: Partner already has another job scheduled during this time window.',
          conflict: {
            conflictingOrderId: conflict.orderId || conflict._id,
            scheduledDate: conflict.scheduledDate,
            scheduledStartTime: conflict.scheduledStartTime,
            scheduledEndTime: conflict.scheduledEndTime,
            serviceName: conflict.serviceName
          }
        });
      }
    }

    // 4. Update Schedule & Tracking
    const oldScheduleStr = request.scheduledDate
      ? `${new Date(request.scheduledDate).toLocaleDateString()} ${request.scheduledStartTime || ''}-${request.scheduledEndTime || ''}`.trim()
      : 'Unscheduled';

    const newScheduleStr = `${new Date(scheduledDate).toLocaleDateString()} ${scheduledStartTime || ''}-${scheduledEndTime || ''}`.trim();

    const trackingMsg = reason
      ? `Job rescheduled from ${oldScheduleStr} to ${newScheduleStr}. Reason: ${reason}`
      : `Job rescheduled from ${oldScheduleStr} to ${newScheduleStr}`;

    const updateFields = {
      scheduledDate: new Date(scheduledDate)
    };
    if (scheduledStartTime !== undefined) updateFields.scheduledStartTime = scheduledStartTime;
    if (scheduledEndTime !== undefined) updateFields.scheduledEndTime = scheduledEndTime;

    const updatedRequest = await Cart.findByIdAndUpdate(
      requestId,
      {
        $set: updateFields,
        $push: {
          tracking: {
            message: trackingMsg,
            status: request.status,
            date: new Date()
          }
        }
      },
      { new: true, session }
    );

    // 5. Audit Logging inside transaction
    await ManagementAudit.create([
      {
        action: 'JOB_RESCHEDULED',
        performedBy: {
          id: callerId,
          name: req.user?.fullName || req.user?.firstName || 'Manager',
          role: callerRole
        },
        targetUser: {
          id: request.assignedPartner || null,
          name: '',
          partnerId: '',
          role: 'PARTNER'
        },
        details: {
          requestId: request._id,
          orderId: request.orderId,
          previousSchedule: oldScheduleStr,
          newSchedule: newScheduleStr,
          reason: reason || 'Operational rescheduling'
        }
      }
    ], { session });

    await session.commitTransaction();
    session.endSession();

    // 6. Real-time event
    try {
      if (ably?.channels) {
        if (request.assignedPartner) {
          ably.channels.get(`partner-${request.assignedPartner}`).publish('job_rescheduled', {
            message: `Task ${updatedRequest.orderId || updatedRequest._id} rescheduled to ${newScheduleStr}`,
            taskId: updatedRequest._id,
            scheduledDate: updatedRequest.scheduledDate,
            scheduledStartTime: updatedRequest.scheduledStartTime,
            scheduledEndTime: updatedRequest.scheduledEndTime
          });
        }
        ably.channels.get('admin-channel').publish('task_updated', {
          message: `Task ${updatedRequest.orderId || updatedRequest._id} rescheduled`,
          taskId: updatedRequest._id
        });
      }
    } catch (e) {
      console.warn('Real-time notify warning:', e.message);
    }

    res.status(200).json({
      statusCode: 200,
      message: `Service request successfully rescheduled to ${newScheduleStr}`,
      data: {
        requestId: updatedRequest._id,
        orderId: updatedRequest.orderId,
        scheduledDate: updatedRequest.scheduledDate,
        scheduledStartTime: updatedRequest.scheduledStartTime,
        scheduledEndTime: updatedRequest.scheduledEndTime,
        status: updatedRequest.status
      }
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 41. MANAGER OPERATIONAL WORKLOAD & PERFORMANCE METRICS (PART 7)
 */
exports.getManagerWorkload = async (req, res) => {
  try {
    const managerId = req.user?.id || req.user?._id;
    const manager = await Partner.findById(managerId)
      .populate('managerConfig.managedCategories', 'serviceName serviceHeading')
      .populate('managerConfig.managedAreas', 'name pincodes');

    if (!manager) {
      return res.status(404).json({ statusCode: 404, message: 'Manager not found' });
    }

    const managedTeamIds = (manager.managerConfig?.managedTeams || []).map(t => t.toString());

    // Teams belonging to manager
    const teams = await Team.find({
      managerId,
      _id: { $in: managedTeamIds }
    }).select('_id name code status teamLeaderId categories areas members');

    const teamIds = teams.map(t => t._id);

    // Team Leaders under manager
    const teamLeaders = await Partner.find({
      role: 'TEAM_LEADER',
      'teamLeaderConfig.managerId': managerId,
      isDeleted: false
    }).select('_id fullName partnerId email contactNumber teamLeaderConfig');

    const leaderMap = new Map();
    teamLeaders.forEach(l => leaderMap.set(l._id.toString(), l));

    // Partners belonging to these teams
    const partners = await Partner.find({
      role: 'PARTNER',
      teamId: { $in: teamIds },
      isDeleted: false
    }).select('_id fullName partnerId email contactNumber designation hub expertise teamId operationalStatus isActive');

    const partnerIds = partners.map(p => p._id);
    const partnerMap = new Map();
    partners.forEach(p => partnerMap.set(p._id.toString(), p));

    // Time boundaries for Today in IST
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Fetch active & relevant scoped jobs
    const activeJobs = await Cart.find({
      assignedPartner: { $in: partnerIds },
      status: { $in: ['pending', 'assigned', 'inProgress', 'completed'] }
    }).select('_id orderId serviceName status assignedPartner scheduledDate scheduledStartTime scheduledEndTime createdAt completedAt');

    // Build unassigned queries
    const managedCategories = manager.managerConfig?.managedCategories || [];
    const categoryIds = managedCategories.map(c => c._id.toString());
    const categoryHeadings = managedCategories.flatMap(c => [c.serviceName, c.serviceHeading].filter(Boolean));
    const managedAreas = manager.managerConfig?.managedAreas || [];
    const hubNames = managedAreas.map(a => a.name);
    const hubPincodes = managedAreas.flatMap(a => a.pincodes || []);

    const unassignedScopeConditions = [];
    if (categoryIds.length > 0) unassignedScopeConditions.push({ mainServiceId: { $in: categoryIds } });
    if (categoryHeadings.length > 0) unassignedScopeConditions.push({ serviceName: { $in: categoryHeadings.map(h => new RegExp(h, 'i')) } });
    if (hubPincodes.length > 0) unassignedScopeConditions.push({ 'deliveryAddress.postalCode': { $in: hubPincodes } });
    if (hubNames.length > 0) unassignedScopeConditions.push({ 'deliveryAddress.city': { $in: hubNames.map(n => new RegExp(n, 'i')) } });

    const unassignedCount = await Cart.countDocuments({
      status: { $ne: 'addToCart' },
      $and: [
        {
          $or: [
            { assignedPartner: null },
            { assignedPartner: { $exists: false } }
          ]
        },
        ...(unassignedScopeConditions.length > 0 ? [{ $or: unassignedScopeConditions }] : [])
      ]
    });

    // Partner-level workload calculation
    const partnerWorkloadMap = new Map();
    partners.forEach(p => {
      const pIdStr = p._id.toString();
      const pJobs = activeJobs.filter(j => j.assignedPartner?.toString() === pIdStr);
      const activePJobs = pJobs.filter(j => ['pending', 'assigned', 'inProgress'].includes(j.status));
      const completedToday = pJobs.filter(j => j.status === 'completed' && j.completedAt >= todayStart && j.completedAt <= todayEnd);
      const overdueJobs = pJobs.filter(j => isJobOverdue(j));

      const dailyCapacity = p.operationalStatus?.dailyCapacity || 5;
      const remainingCapacity = Math.max(0, dailyCapacity - activePJobs.length);
      const isOverloaded = activePJobs.length >= dailyCapacity;

      partnerWorkloadMap.set(pIdStr, {
        partnerId: p._id,
        partnerCode: p.partnerId,
        fullName: p.fullName,
        designation: p.designation || 'Partner',
        teamId: p.teamId,
        isActive: p.isActive,
        availability: p.operationalStatus?.availability || (p.isActive ? 'AVAILABLE' : 'INACTIVE'),
        dailyCapacity,
        activeJobsCount: activePJobs.length,
        completedTodayCount: completedToday.length,
        overdueCount: overdueJobs.length,
        remainingCapacity,
        isOverloaded
      });
    });

    // Team-level workload aggregation
    const teamWorkloadList = teams.map(team => {
      const tIdStr = team._id.toString();
      const teamPartners = partners.filter(p => p.teamId?.toString() === tIdStr);
      const teamPartnerIds = teamPartners.map(p => p._id.toString());

      const teamJobs = activeJobs.filter(j => teamPartnerIds.includes(j.assignedPartner?.toString()));
      const activeTeamJobs = teamJobs.filter(j => ['pending', 'assigned', 'inProgress'].includes(j.status));
      const scheduledToday = teamJobs.filter(j => j.scheduledDate >= todayStart && j.scheduledDate <= todayEnd);
      const inProgress = teamJobs.filter(j => j.status === 'inProgress');
      const completedToday = teamJobs.filter(j => j.status === 'completed' && j.completedAt >= todayStart && j.completedAt <= todayEnd);
      const overdue = teamJobs.filter(j => isJobOverdue(j));

      const availablePartners = teamPartners.filter(p => (p.operationalStatus?.availability || 'AVAILABLE') === 'AVAILABLE' && p.isActive).length;
      const busyPartners = teamPartners.filter(p => (p.operationalStatus?.availability) === 'BUSY').length;

      let leaderInfo = null;
      if (team.teamLeaderId && leaderMap.has(team.teamLeaderId.toString())) {
        const l = leaderMap.get(team.teamLeaderId.toString());
        leaderInfo = { id: l._id, fullName: l.fullName, partnerId: l.partnerId };
      }

      return {
        teamId: team._id,
        name: team.name,
        code: team.code,
        status: team.status,
        teamLeader: leaderInfo,
        totalPartners: teamPartners.length,
        availablePartners,
        busyPartners,
        activeJobsCount: activeTeamJobs.length,
        scheduledTodayCount: scheduledToday.length,
        inProgressCount: inProgress.length,
        completedTodayCount: completedToday.length,
        overdueCount: overdue.length
      };
    });

    // Global summary
    const allActiveJobs = activeJobs.filter(j => ['pending', 'assigned', 'inProgress'].includes(j.status));
    const allTodayScheduled = activeJobs.filter(j => j.scheduledDate >= todayStart && j.scheduledDate <= todayEnd);
    const allInProgress = activeJobs.filter(j => j.status === 'inProgress');
    const allCompletedToday = activeJobs.filter(j => j.status === 'completed' && j.completedAt >= todayStart && j.completedAt <= todayEnd);
    const allOverdue = activeJobs.filter(j => isJobOverdue(j));

    res.status(200).json({
      statusCode: 200,
      message: 'Manager operational workload metrics fetched successfully',
      data: {
        summary: {
          totalActiveJobs: allActiveJobs.length,
          scheduledToday: allTodayScheduled.length,
          inProgress: allInProgress.length,
          completedToday: allCompletedToday.length,
          overdueJobs: allOverdue.length,
          unassignedJobs: unassignedCount
        },
        teams: teamWorkloadList,
        partners: Array.from(partnerWorkloadMap.values())
      }
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 42. TEAM LEADER SQUAD WORKLOAD (PART 7)
 */
exports.getTeamLeaderWorkload = async (req, res) => {
  try {
    const leaderId = req.user?.id || req.user?._id;
    const leader = await Partner.findById(leaderId);
    if (!leader || leader.teamLeaderConfig?.status !== 'ACTIVE') {
      return res.status(403).json({ statusCode: 403, message: 'Access denied: Team Leader is inactive' });
    }

    const teamId = leader.teamLeaderConfig?.teamId;
    if (!teamId) {
      return res.status(403).json({ statusCode: 403, message: 'Access denied: No active team assignment' });
    }

    const team = await Team.findById(teamId).select('name code status');
    const partners = await Partner.find({
      role: 'PARTNER',
      teamId,
      isDeleted: false
    }).select('_id fullName partnerId designation expertise operationalStatus isActive');

    const partnerIds = partners.map(p => p._id);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const activeJobs = await Cart.find({
      assignedPartner: { $in: partnerIds },
      status: { $in: ['pending', 'assigned', 'inProgress', 'completed'] }
    }).select('_id orderId serviceName status assignedPartner scheduledDate scheduledStartTime scheduledEndTime completedAt');

    const partnerWorkloadList = partners.map(p => {
      const pIdStr = p._id.toString();
      const pJobs = activeJobs.filter(j => j.assignedPartner?.toString() === pIdStr);
      const activePJobs = pJobs.filter(j => ['pending', 'assigned', 'inProgress'].includes(j.status));
      const completedToday = pJobs.filter(j => j.status === 'completed' && j.completedAt >= todayStart && j.completedAt <= todayEnd);
      const overdueJobs = pJobs.filter(j => isJobOverdue(j));

      const dailyCapacity = p.operationalStatus?.dailyCapacity || 5;
      const remainingCapacity = Math.max(0, dailyCapacity - activePJobs.length);

      return {
        partnerId: p._id,
        partnerCode: p.partnerId,
        fullName: p.fullName,
        designation: p.designation || 'Partner',
        availability: p.operationalStatus?.availability || (p.isActive ? 'AVAILABLE' : 'INACTIVE'),
        dailyCapacity,
        activeJobsCount: activePJobs.length,
        completedTodayCount: completedToday.length,
        overdueCount: overdueJobs.length,
        remainingCapacity
      };
    });

    const activeSquadJobs = activeJobs.filter(j => ['pending', 'assigned', 'inProgress'].includes(j.status));
    const scheduledToday = activeJobs.filter(j => j.scheduledDate >= todayStart && j.scheduledDate <= todayEnd);
    const inProgress = activeJobs.filter(j => j.status === 'inProgress');
    const completedToday = activeJobs.filter(j => j.status === 'completed' && j.completedAt >= todayStart && j.completedAt <= todayEnd);
    const overdue = activeJobs.filter(j => isJobOverdue(j));

    res.status(200).json({
      statusCode: 200,
      message: 'Squad workload metrics fetched successfully',
      data: {
        team: {
          id: team._id,
          name: team.name,
          code: team.code
        },
        summary: {
          totalActiveJobs: activeSquadJobs.length,
          scheduledToday: scheduledToday.length,
          inProgress: inProgress.length,
          completedToday: completedToday.length,
          overdueJobs: overdue.length
        },
        partners: partnerWorkloadList
      }
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 43. OPERATIONAL SCHEDULE BOARD (PART 7)
 */
exports.getManagerScheduleBoard = async (req, res) => {
  try {
    const managerId = req.user?.id || req.user?._id;
    const { date, teamId, partnerId, status } = req.query;

    const manager = await Partner.findById(managerId).select('managerConfig');
    if (!manager || manager.managerConfig?.status !== 'ACTIVE') {
      return res.status(403).json({ statusCode: 403, message: 'Access denied: Manager is inactive' });
    }

    const managedTeamIds = (manager.managerConfig?.managedTeams || []).map(t => t.toString());

    // Teams validation
    const teams = await Team.find({
      managerId,
      _id: { $in: managedTeamIds }
    }).select('_id name code teamLeaderId');

    const teamIds = teams.map(t => t._id.toString());
    const teamMap = new Map();
    teams.forEach(t => teamMap.set(t._id.toString(), t));

    if (teamId && !teamIds.includes(teamId.toString())) {
      return res.status(403).json({ statusCode: 403, message: 'Access denied: Team outside your management scope' });
    }

    // Scoped partners
    const partners = await Partner.find({
      role: 'PARTNER',
      teamId: { $in: teamId ? [teamId] : teamIds },
      isDeleted: false
    }).select('_id fullName partnerId contactNumber teamId');

    const partnerIds = partners.map(p => p._id.toString());
    const partnerMap = new Map();
    partners.forEach(p => partnerMap.set(p._id.toString(), p));

    if (partnerId && !partnerIds.includes(partnerId.toString())) {
      return res.status(403).json({ statusCode: 403, message: 'Access denied: Partner outside your management scope' });
    }

    // Date range: defaults to today if not provided
    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const query = {
      assignedPartner: partnerId ? partnerId : { $in: partnerIds },
      scheduledDate: { $gte: startOfDay, $lte: endOfDay },
      status: { $ne: 'addToCart' }
    };

    if (status && status !== 'all') {
      query.status = status;
    }

    const scheduledJobs = await Cart.find(query)
      .populate('userId', 'firstName lastName fullName contactNumber')
      .populate('serviceId', 'serviceName serviceCost')
      .populate('assignedPartner', 'fullName partnerId contactNumber teamId')
      .sort({ scheduledStartTime: 1, createdAt: 1 });

    const scheduleItems = scheduledJobs.map(job => {
      const jObj = job.toObject();
      const p = job.assignedPartner ? partnerMap.get(job.assignedPartner._id.toString()) : null;
      const t = p?.teamId ? teamMap.get(p.teamId.toString()) : null;

      jObj.hierarchy = {
        team: t ? { id: t._id, name: t.name, code: t.code } : null,
        partner: p ? { id: p._id, name: p.fullName, partnerId: p.partnerId } : null
      };
      jObj.isOverdue = isJobOverdue(job);
      return jObj;
    });

    res.status(200).json({
      statusCode: 200,
      message: 'Operational schedule board fetched successfully',
      date: targetDate.toISOString().slice(0, 10),
      data: scheduleItems
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 44. TEAM LEADER SQUAD SCHEDULE BOARD (PART 7)
 */
exports.getTeamLeaderScheduleBoard = async (req, res) => {
  try {
    const leaderId = req.user?.id || req.user?._id;
    const { date, partnerId, status } = req.query;

    const leader = await Partner.findById(leaderId);
    const teamId = leader?.teamLeaderConfig?.teamId;
    if (!teamId) {
      return res.status(403).json({ statusCode: 403, message: 'Access denied: No active team' });
    }

    const partners = await Partner.find({ role: 'PARTNER', teamId, isDeleted: false }).select('_id fullName partnerId');
    const partnerIds = partners.map(p => p._id.toString());

    if (partnerId && !partnerIds.includes(partnerId.toString())) {
      return res.status(403).json({ statusCode: 403, message: 'Access denied: Partner is not in your squad' });
    }

    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const query = {
      assignedPartner: partnerId ? partnerId : { $in: partnerIds },
      scheduledDate: { $gte: startOfDay, $lte: endOfDay },
      status: { $ne: 'addToCart' }
    };

    if (status && status !== 'all') {
      query.status = status;
    }

    const jobs = await Cart.find(query)
      .populate('userId', 'firstName lastName fullName contactNumber')
      .populate('serviceId', 'serviceName serviceCost')
      .populate('assignedPartner', 'fullName partnerId contactNumber')
      .sort({ scheduledStartTime: 1 });

    const items = jobs.map(job => {
      const obj = job.toObject();
      obj.isOverdue = isJobOverdue(job);
      return obj;
    });

    res.status(200).json({
      statusCode: 200,
      message: 'Squad schedule board fetched successfully',
      date: targetDate.toISOString().slice(0, 10),
      data: items
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 45. GET PARTNER AVAILABILITY (PART 7)
 */
exports.getPartnerAvailability = async (req, res) => {
  try {
    const { partnerId } = req.params;
    const callerRole = normalizeRole(req.user?.role);
    const callerId = req.user?.id || req.user?._id;

    const partner = await Partner.findOne({ _id: partnerId, isDeleted: false })
      .select('_id fullName partnerId designation teamId operationalStatus isActive');

    if (!partner) {
      return res.status(404).json({ statusCode: 404, message: 'Partner not found' });
    }

    // Scope check
    if (callerRole === 'MANAGER') {
      const manager = await Partner.findById(callerId).select('managerConfig');
      const managedTeams = (manager?.managerConfig?.managedTeams || []).map(t => t.toString());
      if (!partner.teamId) {
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Partner has no team' });
      }
      const team = await Team.findById(partner.teamId);
      if (!team || team.managerId?.toString() !== callerId.toString() || !managedTeams.includes(team._id.toString())) {
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Partner outside your manager scope' });
      }
    } else if (callerRole === 'TEAM_LEADER') {
      const leader = await Partner.findById(callerId);
      const teamId = leader?.teamLeaderConfig?.teamId;
      if (!partner.teamId || partner.teamId.toString() !== teamId?.toString()) {
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Partner not in your squad' });
      }
    } else if (callerRole === 'PARTNER') {
      if (callerId.toString() !== partner._id.toString()) {
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Cannot view other partner availability' });
      }
    }

    res.status(200).json({
      statusCode: 200,
      data: {
        partnerId: partner._id,
        partnerCode: partner.partnerId,
        fullName: partner.fullName,
        availability: partner.operationalStatus?.availability || (partner.isActive ? 'AVAILABLE' : 'INACTIVE'),
        dailyCapacity: partner.operationalStatus?.dailyCapacity || 5,
        lastStatusUpdate: partner.operationalStatus?.lastStatusUpdate
      }
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * 46. UPDATE PARTNER AVAILABILITY (PART 7)
 */
exports.updatePartnerAvailability = async (req, res) => {
  try {
    const { partnerId } = req.params;
    const { availability, dailyCapacity } = req.body;
    const callerRole = normalizeRole(req.user?.role);
    const callerId = req.user?.id || req.user?._id;

    const validAvailabilities = ['AVAILABLE', 'BUSY', 'OFFLINE', 'ON_LEAVE', 'INACTIVE'];
    if (availability && !validAvailabilities.includes(availability)) {
      return res.status(400).json({
        statusCode: 400,
        message: `Invalid availability state. Valid: ${validAvailabilities.join(', ')}`
      });
    }

    const partner = await Partner.findOne({ _id: partnerId, isDeleted: false });
    if (!partner) {
      return res.status(404).json({ statusCode: 404, message: 'Partner not found' });
    }

    // Scope check
    if (callerRole === 'MANAGER') {
      const manager = await Partner.findById(callerId).select('managerConfig');
      const managedTeams = (manager?.managerConfig?.managedTeams || []).map(t => t.toString());
      if (!partner.teamId) {
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Partner has no team' });
      }
      const team = await Team.findById(partner.teamId);
      if (!team || team.managerId?.toString() !== callerId.toString() || !managedTeams.includes(team._id.toString())) {
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Partner outside your manager scope' });
      }
    } else if (callerRole === 'TEAM_LEADER') {
      const leader = await Partner.findById(callerId);
      const teamId = leader?.teamLeaderConfig?.teamId;
      if (!partner.teamId || partner.teamId.toString() !== teamId?.toString()) {
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Partner not in your squad' });
      }
    } else if (callerRole === 'PARTNER') {
      if (callerId.toString() !== partner._id.toString()) {
        return res.status(403).json({ statusCode: 403, message: 'Access denied: Cannot modify other partner availability' });
      }
    }

    if (!partner.operationalStatus) {
      partner.operationalStatus = {};
    }

    const prevAvailability = partner.operationalStatus.availability || (partner.isActive ? 'AVAILABLE' : 'INACTIVE');
    if (availability) partner.operationalStatus.availability = availability;
    if (dailyCapacity !== undefined && Number(dailyCapacity) > 0) partner.operationalStatus.dailyCapacity = Number(dailyCapacity);
    partner.operationalStatus.lastStatusUpdate = new Date();

    await partner.save();

    await ManagementAudit.create({
      action: 'PARTNER_AVAILABILITY_UPDATED',
      performedBy: {
        id: callerId,
        name: req.user?.fullName || req.user?.firstName || 'User',
        role: callerRole
      },
      targetUser: {
        id: partner._id,
        name: partner.fullName,
        partnerId: partner.partnerId,
        role: partner.role
      },
      details: {
        previousAvailability: prevAvailability,
        newAvailability: partner.operationalStatus.availability,
        dailyCapacity: partner.operationalStatus.dailyCapacity
      }
    });

    try {
      if (ably?.channels) {
        ably.channels.get(`partner-${partner._id}`).publish('partner_availability_updated', {
          partnerId: partner._id,
          availability: partner.operationalStatus.availability,
          dailyCapacity: partner.operationalStatus.dailyCapacity
        });
      }
    } catch (e) {
      console.warn('Real-time notification warning:', e.message);
    }

    res.status(200).json({
      statusCode: 200,
      message: `Partner availability updated to ${partner.operationalStatus.availability}`,
      data: {
        partnerId: partner._id,
        availability: partner.operationalStatus.availability,
        dailyCapacity: partner.operationalStatus.dailyCapacity,
        lastStatusUpdate: partner.operationalStatus.lastStatusUpdate
      }
    });
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

exports.isJobOverdue = isJobOverdue;
exports.findScheduleConflict = findScheduleConflict;
