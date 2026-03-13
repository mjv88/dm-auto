export interface Env {
  EMAIL_WORKER_SECRET: string;
  SENDER_EMAIL: string;
}

interface EmailRequest {
  to: string;
  subject: string;
  html: string;
  type: 'verification' | 'password-reset';
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const authHeader = request.headers.get('Authorization');
    if (!authHeader || authHeader !== `Bearer ${env.EMAIL_WORKER_SECRET}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    let body: EmailRequest;
    try {
      body = await request.json() as EmailRequest;
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    if (!body.to || !body.subject || !body.html || !body.type) {
      return new Response('Missing required fields', { status: 400 });
    }

    // Send via MailChannels (or replace with Resend/SES if MailChannels free tier unavailable)
    // NOTE: MailChannels retired free Cloudflare integration in late 2024.
    // Alternative: use Resend (resend.com) or Cloudflare Email Routing.
    const emailResp = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: body.to }] }],
        from: { email: env.SENDER_EMAIL, name: 'Runner Hub' },
        subject: body.subject,
        content: [{ type: 'text/html', value: body.html }],
      }),
    });

    if (!emailResp.ok) {
      const text = await emailResp.text();
      return new Response(`Email send failed: ${text}`, { status: 502 });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
