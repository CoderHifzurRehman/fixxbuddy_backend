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

// Export the function so it can be used in other files
module.exports = { welcomeMailTemplate, otpMailTemplate };
