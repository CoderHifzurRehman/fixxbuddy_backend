const express = require("express");

const userRoutes = require("./user.routes");
const partnerRoutes = require("./partner.routes");

const mainServicesRoutes = require("./mainServices.routes")


const router = express.Router();



// Use the user routes

router.use("/users", userRoutes);

router.use("/partners", partnerRoutes);

//main services
router.use("/mainservices",mainServicesRoutes)


module.exports = router;
