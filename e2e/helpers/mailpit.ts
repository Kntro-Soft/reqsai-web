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

/** Token from the `…/auth/verify-email?token=…` link of the verification email. */
export function getVerificationToken(request: APIRequestContext, email: string): Promise<string> {
  return getEmailToken(request, email, 'Verifica', /verify-email\?token=([A-Za-z0-9._~-]+)/);
}

/** Token from the `…/auth/reset-password?token=…` link of the recovery email. */
export function getResetToken(request: APIRequestContext, email: string): Promise<string> {
  return getEmailToken(request, email, 'Restablece', /reset-password\?token=([A-Za-z0-9._~-]+)/);
}

/**
 * Polls Mailpit for the most recent message to `email` whose subject contains
 * `subjectIncludes`, then extracts the token matching `linkPattern` from its
 * body. The backend delivers transactional mail through the dev-stack Mailpit.
 */
async function getEmailToken(
  request: APIRequestContext,
  email: string,
  subjectIncludes: string,
  linkPattern: RegExp,
): Promise<string> {
  const id = await pollForMessageId(request, email, subjectIncludes);
  const res = await request.get(`${MAILPIT_URL}/api/v1/message/${id}`);
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as MailpitMessage;
  const match = `${body.Text ?? ''} ${body.HTML ?? ''}`.match(linkPattern);
  expect(match, `token (${subjectIncludes}) in email body`).not.toBeNull();
  return match![1];
}

async function pollForMessageId(
  request: APIRequestContext,
  email: string,
  subjectIncludes: string,
): Promise<string> {
  const target = email.toLowerCase();
  for (let attempt = 0; attempt < 20; attempt++) {
    const res = await request.get(`${MAILPIT_URL}/api/v1/messages?limit=50`);
    if (res.ok()) {
      const data = (await res.json()) as { messages: MailpitSummaryItem[] };
      const hit = data.messages.find(
        (m) =>
          m.Subject.includes(subjectIncludes) &&
          m.To.some((t) => t.Address.toLowerCase() === target),
      );
      if (hit) return hit.ID;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No "${subjectIncludes}" email arrived for ${email}`);
}
