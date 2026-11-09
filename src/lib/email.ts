import "server-only";
import { Resend } from "resend";

interface Message {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}

/** With RESEND_API_KEY unset in development, prints to the server log so local use needs no email service. */
async function deliver(message: Message) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`\n[reresearch] ${message.subject} for ${message.to}:\n${message.text}\n`);
      return;
    }
    throw new Error("Email is not configured (RESEND_API_KEY)");
  }
  const from = process.env.EMAIL_FROM ?? "reresearch <onboarding@resend.dev>";
  const { error } = await new Resend(key).emails.send({ from, ...message });
  if (error) throw new Error(`Email failed: ${error.message}`);
}

function linkHtml(intro: string, button: string, url: string, footer: string) {
  return `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:24px auto;color:#0f1419">
  <p style="font-size:18px;font-weight:700;margin:0 0 16px">re<span style="color:#5b5bd6">research</span></p>
  <p style="font-size:15px;line-height:1.5">${intro}</p>
  <p style="margin:24px 0"><a href="${url}" style="background:#0f1419;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600">${button}</a></p>
  <p style="font-size:13px;color:#536471">${footer}</p>
</div>`;
}

export async function sendSignInEmail(to: string, url: string) {
  await deliver({
    to,
    subject: "Your reresearch sign-in link",
    text: `Tap to sign in to reresearch:\n\n${url}\n\nThe link works once and expires in an hour. If you didn't ask for it, ignore this email.`,
    html: linkHtml(
      "Tap the button to sign in. The link works once and expires in an hour.",
      "Sign in",
      url,
      "If you didn't ask for this, ignore it.",
    ),
  });
}

export async function sendInviteEmail(to: string, url: string) {
  const login = new URL("/login", url).toString();
  await deliver({
    to,
    subject: "You're invited to reresearch",
    text: `You're invited to reresearch: new research papers, read as threads.\n\nTap to sign in:\n\n${url}\n\nThis link works once and expires in an hour. Your invite doesn't expire: enter your email at ${login} any time for a new link.`,
    html: linkHtml(
      "You're invited to reresearch: new research papers, read as threads.",
      "Sign in",
      url,
      `This link works once and expires in an hour. Your invite doesn't expire: enter your email at <a href="${login}" style="color:#536471">the sign-in page</a> any time for a new link.`,
    ),
  });
}

/** Plain text only: the addresses come from a public form. */
export async function sendRequestDigestEmail(to: string[], emails: string[], total: number, settingsUrl: string) {
  const more = total - emails.length;
  await deliver({
    to,
    subject: `reresearch: ${total} new access request${total === 1 ? "" : "s"}`,
    text: `Asking for access:\n\n${emails.join("\n")}${more > 0 ? `\n…and ${more} more` : ""}\n\nApprove or decline them in Settings:\n${settingsUrl}`,
  });
}
