const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,

  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },

  requireTLS: true,

  tls: {
    rejectUnauthorized: false,
  },
});

const sendEmail = async ({ to, subject, html, text }) => {
  if (!to) {
    throw new Error("Aucun destinataire email fourni");
  }

  const info = await transporter.sendMail({
    from: `"${process.env.EMAIL_FROM || "ElDior Management Church"}" <${
      process.env.EMAIL_USER
    }>`,
    to,
    subject,
    text: text || undefined,
    html: html || undefined,
  });

  return info;
};

module.exports = sendEmail;