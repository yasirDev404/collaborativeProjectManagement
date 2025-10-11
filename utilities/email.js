import nodemailer from "nodemailer";

const sendEmail = async (to, subject, text) => {
  console.log("📤 Preparing to send email...");
  console.log("To:", to);
  console.log("Subject:", subject);
  console.log("Using SMTP_USER:", process.env.SMTP_USER);

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS, 
      },
      timeout: 10000, 
    });

    const info = await transporter.sendMail({
      from: `"Dexa Doors"<${process.env.SMTP_USER}>`,
      to,
      subject,
      text,
    });

    console.log("✅ Email sent successfully: ", info.response);
    return info;
  } catch (error) {
    console.error("❌ Error sending email:", error.message);
    throw error;
  }
};

export default sendEmail;
