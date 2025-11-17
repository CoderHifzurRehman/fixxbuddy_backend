const nodemailer = require('nodemailer')
require('dotenv').config();

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE,
  host: process.env.EMAIL_HOST,
  port:process.env.EMAIL_PORT,
  secure: false,
  auth:{
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
});

const sendEmail = async(subject, recipientEmail, body) =>{
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: recipientEmail,
      subject: subject,
      html: body,
    };
    const info = await transporter.sendMail(mailOptions);
  } catch (error) {
    throw error;
  }
};

module.exports= {sendEmail};

