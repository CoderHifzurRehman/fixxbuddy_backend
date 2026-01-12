const express = require("express");

const userRoutes = require("./user.routes");
const partnerRoutes = require("./partner.routes");

const mainServicesRoutes = require("./mainServices.routes")
const mainServicesCategoriesRoutes = require("./mainServicesCategories.routes")
const applicationTypeRoutes = require("./applicationType.routes")
const serviceTypeRoutes = require("./serviceType.routes")

const cartRoutes = require('./cart.routes');
const rateCardRoutes = require('./rateCard.routes');
const quotationRoutes = require('./quotation.routes');


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

router.use("/serviceType", serviceTypeRoutes)

router.use('/cart', cartRoutes);
router.use('/rate-cards', rateCardRoutes);
router.use('/quotation', quotationRoutes);


module.exports = router;
