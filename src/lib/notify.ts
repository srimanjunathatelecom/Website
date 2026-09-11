import { db } from "@/db";
import { notifications, notificationSettings } from "@/db/schema";

export type NotifyType = "order" | "booking" | "claim" | "lowstock" | "system";

export async function createNotification(
  type: NotifyType,
  title: string,
  message: string,
  link = ""
) {
  try {
    const [n] = await db
      .insert(notifications)
      .values({ type, title, message, link })
      .returning();
    await maybeSendEmail(title, message);
    return n;
  } catch (e) {
    console.error("createNotification failed", e);
    return null;
  }
}

export async function getSettings() {
  const [s] = await db.select().from(notificationSettings).where(eqId());
  return s ?? null;
}

// Small helper to read settings row (id = 1)
import { eq } from "drizzle-orm";
function eqId() {
  return eq(notificationSettings.id, 1);
}

async function maybeSendEmail(subject: string, body: string) {
  const settings = await getSettings();
  if (!settings || !settings.emailEnabled) return;
  const host = process.env.SMTP_HOST;
  if (!host) return;
  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM || settings.email,
      to: settings.email,
      subject: `[SMS Stores] ${subject}`,
      text: body,
    });
  } catch (e) {
    console.error("email send failed", e);
  }
}

/**
 * Sends a transactional email directly to a customer (order confirmation,
 * payment confirmation, status update, cancellation, invoice, etc).
 *
 * Unlike maybeSendEmail (owner/admin alerts, gated by notificationSettings
 * .emailEnabled), customer-facing transactional email always attempts to
 * send once SMTP is configured — a customer's order confirmation shouldn't
 * silently disappear because the owner toggled off their own alert
 * preference. Returns true if sent, false if SMTP isn't configured or the
 * send failed; callers should treat false as "skipped", not throw, since a
 * failed notification email must never block order/payment/status logic
 * that already succeeded.
 */
export async function sendCustomerEmail(
  toEmail: string,
  subject: string,
  text: string
): Promise<boolean> {
  const host = process.env.SMTP_HOST;
  if (!host || !toEmail) return false;
  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: toEmail,
      subject: `[SMS Stores] ${subject}`,
      text,
    });
    return true;
  } catch (e) {
    console.error("customer email send failed", e);
    return false;
  }
}

// Moved to lib/whatsapp.ts (client-safe, no DB import) so client components
// can build links too; re-exported here so server callers don't change.
export { whatsappLink } from "./whatsapp";

/**
 * Sends a login OTP directly to the given admin's email address.
 * Unlike maybeSendEmail (used for store notifications), this always
 * attempts to send when SMTP is configured — login security shouldn't
 * depend on the notificationSettings.emailEnabled toggle, which is
 * meant for order/booking alerts, not auth codes.
 *
 * Returns true if the email was sent, false otherwise (caller should
 * treat false as a hard failure for the login flow, not a silent skip).
 */
export async function sendAdminOtpEmail(toEmail: string, code: string): Promise<boolean> {
  const host = process.env.SMTP_HOST;
  if (!host) return false;
  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: toEmail,
      subject: "[SMS Stores] Your admin login code",
      text: `Your admin login verification code is ${code}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`,
    });
    return true;
  } catch (e) {
    console.error("admin OTP email send failed", e);
    return false;
  }
}
