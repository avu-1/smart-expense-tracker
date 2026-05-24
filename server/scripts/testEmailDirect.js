// Runs directly on Railway to test SMTP from inside the container
require('dotenv').config({ path: require('path').join(__dirname, '../../server/.env') });

const nodemailer = require('nodemailer');

async function main() {
  console.log('SMTP_HOST:', process.env.SMTP_HOST);
  console.log('SMTP_PORT:', process.env.SMTP_PORT);
  console.log('SMTP_SECURE:', process.env.SMTP_SECURE);
  console.log('SMTP_USER:', process.env.SMTP_USER);
  console.log('SMTP_PASS:', process.env.SMTP_PASS ? '***set***' : 'NOT SET');

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 465,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  console.log('\nVerifying connection...');
  try {
    await transporter.verify();
    console.log('✅ SMTP connection verified!');
  } catch (e) {
    console.error('❌ SMTP verify failed:', e.message);
    process.exit(1);
  }

  console.log('\nSending test email...');
  try {
    const info = await transporter.sendMail({
      from: `"SpendWise" <${process.env.SMTP_USER}>`,
      to: process.env.SMTP_USER,
      subject: 'Railway SMTP Test',
      text: 'If you see this, nodemailer is working from Railway!',
    });
    console.log('✅ Email sent! Message ID:', info.messageId);
  } catch (e) {
    console.error('❌ Send failed:', e.message);
    console.error(e);
  }

  process.exit(0);
}

main();
