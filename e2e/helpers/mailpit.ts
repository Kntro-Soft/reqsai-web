import { APIRequestContext, expect } from '@playwright/test';

const MAILPIT_URL = process.env['MAILPIT_URL'] ?? 'http://localhost:8025';

interface MailpitRecipient {
  Address: string;
}

interface MailpitSummaryItem {
  ID: string;
  To: MailpitRecipient[];
  Subject: string;
}

interface MailpitMessage {
  Text?: string;
  HTML?: string;
}

/**
 * Polls Mailpit for the verification email sent to `email` and returns the
 * one-time token embedded in the `…/auth/verify-email?token=…` link. The
 * backend delivers transactional mail through the same Mailpit instance the
 * dev stack uses.
 */
export async function getVerificationToken(
  request: APIRequestContext,
  email: string,
): Promise<string> {
  const id = await pollForMessageId(request, email);
  const res = await request.get(`${MAILPIT_URL}/api/v1/message/${id}`);
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as MailpitMessage;
  const content = `${body.Text ?? ''} ${body.HTML ?? ''}`;
  const match = content.match(/verify-email\?token=([A-Za-z0-9._~-]+)/);
  expect(match, 'verification token in email body').not.toBeNull();
  return match![1];
}

async function pollForMessageId(request: APIRequestContext, email: string): Promise<string> {
  const target = email.toLowerCase();
  for (let attempt = 0; attempt < 20; attempt++) {
    const res = await request.get(`${MAILPIT_URL}/api/v1/messages?limit=50`);
    if (res.ok()) {
      const data = (await res.json()) as { messages: MailpitSummaryItem[] };
      const hit = data.messages.find(
        (m) =>
          m.Subject.includes('Verifica') && m.To.some((t) => t.Address.toLowerCase() === target),
      );
      if (hit) return hit.ID;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No verification email arrived for ${email}`);
}
