import "server-only";
import { Resend } from "resend";

/**
 * Sends the sign-in link. With RESEND_API_KEY unset in development, prints the link to the
 * server log instead so local sign-in works without an email service.
 */
export async function sendSignInEmail(to: string, url: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`\n[reresearch] Sign-in link for ${to}:\n${url}\n`);
      return;
    }
    throw new Error("Email is not configured (RESEND_API_KEY)");
  }
  const from = process.env.EMAIL_FROM ?? "reresearch <onboarding@resend.dev>";
  const { error } = await new Resend(key).emails.send({
    from,
    to,
    subject: "Your reresearch sign-in link",
    text: `Tap to sign in to reresearch:\n\n${url}\n\nThe link works once and expires in 15 minutes. If you didn't ask for it, ignore this email.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:24px auto;color:#0f1419">
  <p style="font-size:18px;font-weight:700;margin:0 0 16px">re<span style="color:#5b5bd6">research</span></p>
  <p style="font-size:15px;line-height:1.5">Tap the button to sign in. The link works once and expires in 15 minutes.</p>
  <p style="margin:24px 0"><a href="${url}" style="background:#0f1419;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600">Sign in</a></p>
  <p style="font-size:13px;color:#536471">If you didn't ask for this, ignore it.</p>
</div>`,
  });
  if (error) throw new Error(`Email failed: ${error.message}`);
}
