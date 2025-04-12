const express = require("express");

const userRoutes = require("./user.routes");
const partnerRoutes = require("./partner.routes");

const mainServicesRoutes = require("./mainServices.routes")
const mainServicesCategoriesRoutes = require("./mainServicesCategories.routes")
const applicationTypeRoutes = require("./applicationType.routes")


const router = express.Router();



// Use the user routes

router.use("/users", userRoutes);

router.use("/partners", partnerRoutes);

//main services
router.use("/mainservices",mainServicesRoutes)

//main services categories
router.use("/mainservicescategories", mainServicesCategoriesRoutes)

//application Type categories
router.use("/applicationType", applicationTypeRoutes)


module.exports = router;
