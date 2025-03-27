const { sendEmail } = require("../config/email");
const Partner = require("../models/partner.model");
const { generateToken } = require("../utils/jwt");
const bcrypt = require("bcryptjs");


const validatePasswordStrength = (password) => {
    const minLength = 8;

    // Regular expression for:
    // 1. At least one uppercase letter (A-Z)
    // 2. At least one lowercase letter (a-z)
    // 3. At least one digit (0-9)
    // 4. At least one special character (e.g. @$!%?&)
    // 5. Minimum 8 characters
    // Regex to check the password rules
    const regex =
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+={}\[\]|\\:;'"<>,.?/`~]).{8,16}$/;

    return password.length >= minLength && regex.test(password);
};

exports.partnerRegistration = async (req, res) => {
    try {
        const { fullName, email, password, dob, aadharCardNumber, contactNumber, address, pinCode, gender, bloodGroup, designation, expertise, hub, createdBy } = req.body;

        // Check if password is strong enough
        if (!validatePasswordStrength(password)) {
            return res
                .status(400)
                .send(
                    "Password must be at least 8-16 characters long and contain a mix of uppercase, lowercase, numbers, and special characters."
                );
        }

        const existingPartner = await Partner.findOne({ email });

        if (existingPartner) {
            return res.status(409).send({
                statusCode: 409,
                message: "Partner already exists.",
            });
        }




        // Proceed to create a new newPartner
        const newPartner = new Partner({
            fullName, email, password, dob, aadharCardNumber, contactNumber, address, pinCode, gender, bloodGroup, designation, expertise, hub, createdBy
        });


        // Save the new Partner to the database
        await newPartner.save();


        res.status(201).send({
            statusCode: 201,
            message: "Partner registered successfully.",
            data: { email },
        });
    } catch (err) {
        const errorMsg = err.message || "Unknown error";
        res.status(500).send({ statusCode: 500, message: errorMsg });
    }
};



exports.partnerLogin = async (req, res) => {
  try {
    const { email ,password } = req.body;

    const partner = await Partner.findOne({ email });

    if (!partner) {
      return res.status(404).send({
        statusCode: 404,
        message: "User not found.",
      });
    }

    // const isPasswordMatch = await bcrypt.compare(password, user.password);
    const isPasswordMatch = await bcrypt.compare(password, partner.password);

    if (!isPasswordMatch) {
      return res.status(400).send({
        statusCode: 400,
        message: "Invalid password.",
      });
    }
    // If password matches, generate a token
    const token = generateToken(partner);
    

    res.status(200).send({
      statusCode: 200,
      message: "partner login successfully.",
      data:partner,
      token:token
    });
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    res.status(500).send({ statusCode: 500, message: errorMsg });
  }
};
