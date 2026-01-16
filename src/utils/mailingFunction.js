function welcomeMailTemplate(data) {
    const { otp } = data; // Destructure the otp value from the data object

    return `
    <html>
<head>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333333;
            max-width: 600px;
            margin: 0 auto;
            padding: 0;
            background-color: #f4f7f9;
        }
        .container {
            margin: 20px auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 10px rgba(0,0,0,0.1);
        }
        .header {
            background-color: #2E5D9E;
            padding: 30px 20px;
            text-align: center;
        }
        .header img {
            max-width: 180px;
        }
        .content {
            padding: 40px 30px;
            text-align: center;
        }
        .content h2 {
            color: #2E5D9E;
            font-size: 24px;
            margin-bottom: 20px;
        }
        .content p {
            font-size: 16px;
            color: #555555;
            margin-bottom: 30px;
        }
        .otp-container {
            background-color: #f0f7ff;
            border: 2px dashed #2E5D9E;
            border-radius: 12px;
            padding: 20px;
            margin: 20px 0;
            display: inline-block;
        }
        .otp-code {
            font-size: 32px;
            font-weight: bold;
            color: #2E5D9E;
            letter-spacing: 5px;
        }
        .footer {
            background-color: #f9fafb;
            padding: 20px;
            text-align: center;
            font-size: 13px;
            color: #888888;
            border-top: 1px solid #eeeeee;
        }
        .footer p {
            margin: 5px 0;
        }
        .social-links {
            margin-top: 15px;
        }
        .social-links a {
            color: #2E5D9E;
            text-decoration: none;
            margin: 0 10px;
        }
        .expiry-note {
            font-size: 14px;
            color: #e74c3c;
            font-weight: 500;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <img src="https://fixxbuddy.s3.ap-south-1.amazonaws.com/Website/Images/fixxbuddy_white_logo.png" alt="Fixxbuddy Logo">
        </div>
        
        <div class="content">
            <h2>Welcome to Fixxbuddy!</h2>
            <p>Thank you for joining our community. We're excited to have you on board. To complete your registration and verify your account, please use the One-Time Password (OTP) below:</p>
            
            <div class="otp-container">
                <div class="otp-code">${otp}</div>
            </div>
            
            <p class="expiry-note">This OTP is valid for 10 minutes only.</p>
            
            <p>If you did not request this verification, please ignore this email or contact our support team.</p>
        </div>
        
        <div class="footer">
            <p>© 2025 Fixxbuddy. All rights reserved.</p>
            <p>Premium Urban Services for Modern Living</p>
            <div class="social-links">
                <a href="https://www.fixxbuddy.com/">Website</a>
                <a href="https://www.fixxbuddy.com/terms">Terms</a>
                <a href="https://www.fixxbuddy.com/privacy">Privacy</a>
            </div>
        </div>
    </div>
</body>
</html>`;
}


// Define the OTP email template function
function otpMailTemplate(data) {
    const { otp } = data; // Destructure the otp value from the data object

    return `
    <html>
<head>
    <style>
        body {
            font-family: 'Arial', sans-serif;
            line-height: 1.6;
            color: #333333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }
        .header {
            background-color: #000000ff;
            padding: 20px;
            text-align: center;
            border-radius: 5px 5px 0 0;
        }
        .header img {
            max-width: 180px;
        }
        .content {
            padding: 25px;
            background-color: #ffffff;
            border-left: 1px solid #e0e0e0;
            border-right: 1px solid #e0e0e0;
        }
        .otp-code {
            font-size: 28px;
            font-weight: bold;
            color: #2E5D9E;
            text-align: center;
            margin: 25px 0;
            letter-spacing: 3px;
        }
        .footer {
            background-color: #f5f5f5;
            padding: 20px;
            text-align: center;
            font-size: 12px;
            color: #777777;
            border-radius: 0 0 5px 5px;
            border-left: 1px solid #e0e0e0;
            border-right: 1px solid #e0e0e0;
            border-bottom: 1px solid #e0e0e0;
        }
        .button {
            background-color: #2E5D9E;
            color: white;
            padding: 10px 20px;
            text-decoration: none;
            border-radius: 4px;
            display: inline-block;
            margin: 15px 0;
        }
        .note {
            font-size: 12px;
            color: #ff0000;
            font-style: italic;
        }
    </style>
</head>
<body>
    <div class="header">
        <img src="https://fixxbuddy.s3.ap-south-1.amazonaws.com/Website/Images/fixxbuddy_white_logo.png" alt="Fixxbuddy Logo">
    </div>
    
    <div class="content">
        <h2>Account Verification</h2>
        <p>Dear Customer,</p>
        <p>Thank you for choosing Fixxbuddy - your trusted partner for <strong>modern, convenient services</strong>. To complete your registration, please use the following One-Time Password (OTP):</p>
        
        <div class="otp-code">${otp}</div>
        
        <p>This OTP is valid for <strong>10 minutes</strong> only. Please do not share this code with anyone for security reasons.</p>
        
        <p class="note">If you didn't request this verification, please ignore this email or contact our support team immediately.</p>
    </div>
    
    <div class="footer">
        <p>© 2025 Fixxbuddy. All rights reserved.</p>
        <p>Providing premium urban services for modern living</p>
        <p>
            <a href="https://www.fixxbuddy.com/" style="color: #2E5D9E; text-decoration: none;">Our Website</a> | 
            <a href="https://www.fixxbuddy.com/services" style="color: #2E5D9E; text-decoration: none;">Our Services</a>
        </p>
    </div>
</body>
</html>`;
}

// Add to your mailing functions
function serviceStartOtpTemplate(user, otp) {
  return `
  <html>
  <head>
      <style>
          body {
              font-family: 'Arial', sans-serif;
              line-height: 1.6;
              color: #333333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
          }
          .header {
              background-color: #000000ff;
              padding: 20px;
              text-align: center;
              border-radius: 5px 5px 0 0;
          }
          .header img {
              max-width: 180px;
          }
          .content {
              padding: 25px;
              background-color: #ffffff;
              border-left: 1px solid #e0e0e0;
              border-right: 1px solid #e0e0e0;
          }
          .otp-code {
              font-size: 28px;
              font-weight: bold;
              color: #2E5D9E;
              text-align: center;
              margin: 25px 0;
              letter-spacing: 3px;
          }
          .footer {
              background-color: #f5f5f5;
              padding: 20px;
              text-align: center;
              font-size: 12px;
              color: #777777;
              border-radius: 0 0 5px 5px;
              border-left: 1px solid #e0e0e0;
              border-right: 1px solid #e0e0e0;
              border-bottom: 1px solid #e0e0e0;
          }
          .info-box {
              background-color: #f8f9fa;
              border-left: 4px solid #2E5D9E;
              padding: 15px;
              margin: 15px 0;
          }
      </style>
  </head>
  <body>
      <div class="header">
          <img src="https://fixxbuddy.s3.ap-south-1.amazonaws.com/Website/Images/fixxbuddy_white_logo.png" alt="Fixxbuddy Logo">
      </div>
      
      <div class="content">
          <h2>Service Starting Notification</h2>
          <p>Dear ${user.firstName} ${user.lastName},</p>
          
          <div class="info-box">
              <p><strong>Your service professional is arriving and has requested to start the service.</strong></p>
              <p>Please provide the following OTP to the service professional to begin the work:</p>
          </div>
          
          <div class="otp-code">${otp}</div>
          
          <p>This OTP is valid for <strong>10 minutes</strong> and must be shared only with the verified Fixxbuddy service professional.</p>
          
          <p><strong>Security Notice:</strong></p>
          <ul>
              <li>Do not share this OTP with anyone else</li>
              <li>Verify the professional's identity card before sharing OTP</li>
              <li>The OTP will expire after 10 minutes</li>
          </ul>
      </div>
      
      <div class="footer">
          <p>© 2025 Fixxbuddy. All rights reserved.</p>
          <p>Your trusted partner for premium services</p>
      </div>
  </body>
  </html>`;
}

module.exports = { welcomeMailTemplate, otpMailTemplate, serviceStartOtpTemplate };
