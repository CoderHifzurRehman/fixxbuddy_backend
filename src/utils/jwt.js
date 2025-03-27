const jwt = require('jsonwebtoken');
require('dotenv').config(); 

const secret = process.env.SECRETKEY;
const generateToken = (user) => {
    return jwt.sign(
        { id: user._id,
          isAdmin: user.isAdmin,  
         },
        secret,
        { expiresIn: '365d' }
    );
};

module.exports = { generateToken };

