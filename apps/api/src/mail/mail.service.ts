import { Injectable, Logger } from "@nestjs/common";
import nodemailer from "nodemailer";
import type Transporter from "nodemailer/lib/mailer";
import { env } from "../config/env";

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: false,
      tls: { rejectUnauthorized: false },
    });
  }

  async send(options: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<void> {
    await this.transporter.sendMail({
      from: env.smtpFrom,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
    this.logger.log(`Sent mail to ${options.to}: ${options.subject}`);
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const link = `${env.webOrigin}/verify-email?token=${encodeURIComponent(token)}`;
    await this.send({
      to,
      subject: "Verify your Memora email",
      text: [
        "Welcome to Memora.",
        "",
        "Verify your email with this link:",
        link,
        "",
        `Or POST /api/v1/auth/verify-email with token: ${token}`,
        "",
        "This link expires in 24 hours.",
      ].join("\n"),
      html: `<p>Welcome to Memora.</p><p><a href="${link}">Verify your email</a></p><p>Token (for API testing): <code>${token}</code></p>`,
    });
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const link = `${env.webOrigin}/reset-password?token=${encodeURIComponent(token)}`;
    await this.send({
      to,
      subject: "Reset your Memora password",
      text: [
        "A password reset was requested for your Memora account.",
        "",
        "Reset with this link:",
        link,
        "",
        `Or POST /api/v1/auth/password/reset with token: ${token}`,
        "",
        "This link expires in 1 hour. If you did not request this, ignore this email.",
      ].join("\n"),
      html: `<p>Reset your password:</p><p><a href="${link}">Reset password</a></p><p>Token (for API testing): <code>${token}</code></p>`,
    });
  }
}
