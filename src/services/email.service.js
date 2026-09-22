/**
 * Send transactional email via Brevo (HTTPS API).
 * Requires BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME in .env
 */
async function sendTransactionalEmail({ to, subject, html }) {
  const key = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || "Alumni Connect";

  if (!key || !senderEmail) {
    console.warn(
      "[email] Brevo not configured (BREVO_API_KEY / BREVO_SENDER_EMAIL). Skipping send to",
      to,
    );
    return { skipped: true };
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": key,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brevo error ${res.status}: ${text}`);
  }

  return { skipped: false };
}

function frontendBaseUrl() {
  return (
    process.env.FRONTEND_URL?.replace(/\/$/, "") || "http://localhost:5173"
  );
}

module.exports = { sendTransactionalEmail, frontendBaseUrl };
