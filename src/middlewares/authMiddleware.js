require("dotenv").config();
const jwt = require("jsonwebtoken");

const secret = process.env.SECRETKEY;

// Authentication Middleware - Verifies the JWT token
const authMiddleware = async (req, res, next) => {
  const token = req.header("Authorization") && req.header("Authorization").replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ statusCode: 401, message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, secret);
    req.user = { ...decoded }; // Attach decoded user info to req.user
    next(); // Proceed to the next middleware
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ statusCode: 401, message: "Token has expired" });
    }
    res.status(401).json({ statusCode: 401, message: "Token is not valid", error: err.message });
  }
};

// Admin Authorization Middleware - Checks if the user is an admin
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        statusCode: 403, 
        message: `Access denied. Only ${allowedRoles.join(', ')} can access this route.` 
      });
    }
    next(); // Proceed if the user's role is allowed
  };
};
module.exports = { authMiddleware, authorizeRoles };
