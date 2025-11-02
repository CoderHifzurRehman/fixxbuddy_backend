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
  // Add these timeout settings
  connectionTimeout: 10000, // 10 seconds
  greetingTimeout: 10000,   // 10 seconds  
  socketTimeout: 15000,     // 15 seconds
  // For better handling in cloud environments
  pool: true,
  maxConnections: 3,
  // maxMessages: 100,
});

const sendEmail = async(subject, recipientEmail, body) =>{
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: recipientEmail,
      subject: subject,
      html: body,
    };
     // Add timeout to the email sending
    const info = await Promise.race([
      transporter.sendMail(mailOptions),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Email timeout after 15 seconds')), 15000)
      )
    ]);
    
    console.log('Email sent successfully to:', recipientEmail);
    return info;
  } catch (error) {
    console.error('Email sending failed for:', recipientEmail, error.message);
    throw error;
  }
};

module.exports= {sendEmail};

