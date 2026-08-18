require("dotenv").config();

const sendEmail = require("../utils/sendEmail");

const test = async () => {
  try {
    console.log("Tentative d'envoi...");

    const info = await sendEmail({
      to: process.env.EMAIL_USER,
      subject: "Test ElDior Management Church",
      html: `
        <h2>ElDior Management Church</h2>
        <p>Le système d'email fonctionne.</p>
      `,
    });

    console.log("✅ Email envoyé");
    console.log("Message ID :", info.messageId);
  } catch (error) {
    console.error("❌ Erreur :", error.message);
    console.error("Code :", error.code);
    console.error("Response :", error.response);
  }
};

test();