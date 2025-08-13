function welcomeMailTemplate(data) {
    const { otp } = data; // Destructure the otp value from the data object

    return `
    <html>
        <body>
          <h2>Welcome!</h2>
          <p>Thank you for registering with us. Your One-Time Password (OTP) for verifying your account is:</p>
          <h3 style="color: #4CAF50; font-size: 24px;">${otp}</h3>
          <p>This OTP will expire in 10 minutes. Please enter it within that time frame to complete your registration.</p>
          <p>If you did not request this verification, please ignore this email.</p>
          <p>Best regards,<br>Your Company Team</p>
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
            background-color: #2E5D9E;
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
        <img src="https://fixxbuddy.s3.ap-south-1.amazonaws.com/Website/Images/logo.png" alt="Fixxbuddy Logo">
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

// Export the function so it can be used in other files
module.exports = { welcomeMailTemplate, otpMailTemplate };
