const jwt = require('jsonwebtoken');
require('dotenv').config(); 

const secret = process.env.SECRETKEY;
const generateToken = (user) => {
    const canonicalRole = (user.role || '').toUpperCase();
    return jwt.sign(
        { 
          id: user._id,
          role: canonicalRole,
          isAdmin: canonicalRole === 'ADMIN'
        },
        secret,
        { expiresIn: '365d' }
    );
};

module.exports = { generateToken };
