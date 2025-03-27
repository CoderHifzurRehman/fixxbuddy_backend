const express = require("express");

const userRoutes = require("./user.routes");
const partnerRoutes = require("./partner.routes");


const router = express.Router();



// Use the user routes

router.use("/users", userRoutes);

router.use("/partners", partnerRoutes);


module.exports = router;
