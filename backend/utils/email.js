const nodemailer = require('nodemailer');

// Voor nu gebruiken we een simpele console.log als placeholder
// Voor echte emails heb je SendGrid, Mailgun, of SMTP nodig

async function sendEmailAlert(email, subject, message) {
  console.log(`📧 Email alert sent to ${email}: ${subject}`);
  console.log(`📧 Message: ${message}`);
  return { success: true };
}

// Echte implementatie met nodemailer:
/*
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

async function sendEmailAlert(email, subject, message) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject,
    html: message
  });
}
*/

module.exports = { sendEmailAlert };
