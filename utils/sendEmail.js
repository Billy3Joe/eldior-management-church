const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.gmail.com",
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: false,

  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },

  requireTLS: true,

  tls: {
    // Développement local uniquement :
    // Avast remplace actuellement le certificat Gmail.
    rejectUnauthorized: false,
    servername: "smtp.gmail.com",
  },

  connectionTimeout: 30000,
  greetingTimeout: 30000,
  socketTimeout: 60000,
});

const sendEmail = async ({ to, subject, html, text }) => {
  if (!to) {
    throw new Error("Aucun destinataire email fourni");
  }

  if (!subject) {
    throw new Error("Sujet email manquant");
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

  console.log("========== EMAIL ==========");
  console.log("Destinataire :", to);
  console.log("Message ID :", info.messageId);
  console.log("Accepté :", info.accepted);
  console.log("Rejeté :", info.rejected);
  console.log("Réponse SMTP :", info.response);
  console.log("===========================");

  return info;
};

module.exports = sendEmail;