require("dotenv").config();
const jwt = require("jsonwebtoken");

const secret = process.env.SECRETKEY;

// Authentication Middleware - Verifies the JWT token and normalizes canonical role
const authMiddleware = async (req, res, next) => {
  const token = req.header("Authorization") && req.header("Authorization").replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ statusCode: 401, message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, secret);
    const canonicalRole = (decoded.role || '').toUpperCase();
    
    // Check deleted partner status for any partner-derived role
    const partnerRoles = ['PARTNER', 'MANAGER', 'TEAM_LEADER'];
    if (partnerRoles.includes(canonicalRole)) {
      const Partner = require('../models/partner.model');
      const partner = await Partner.findById(decoded._id || decoded.id);
      
      if (!partner || partner.isDeleted) {
        return res.status(401).json({ 
          statusCode: 401, 
          message: "Your account has been deleted or deactivated. You are logged out.", 
          forceLogout: true 
        });
      }
      req.partner = partner;
    }

    req.user = { 
      ...decoded, 
      role: canonicalRole,
      isAdmin: canonicalRole === 'ADMIN'
    };
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ statusCode: 401, message: "Token has expired" });
    }
    res.status(401).json({ statusCode: 401, message: "Token is not valid", error: err.message });
  }
};

// Authorization Middleware - Checks if the user's canonical uppercase role is allowed
const authorizeRoles = (...allowedRoles) => {
  const normalizedAllowed = allowedRoles.map(r => r.toUpperCase());
  return (req, res, next) => {
    const userRole = (req.user?.role || '').toUpperCase();
    if (!req.user || !normalizedAllowed.includes(userRole)) {
      return res.status(403).json({ 
        statusCode: 403, 
        message: `Access denied. Only ${allowedRoles.join(', ')} can access this route.` 
      });
    }
    next();
  };
};

module.exports = { authMiddleware, authorizeRoles };
