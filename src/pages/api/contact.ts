export const prerender = false;

import nodemailer from 'nodemailer';

const rateMap = new Map<string, number[]>();
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const window = 10 * 60 * 1000;
  const hits = (rateMap.get(ip) || []).filter(t => now - t < window);
  hits.push(now);
  rateMap.set(ip, hits);
  if (rateMap.size > 1000) {
    for (const [key, times] of rateMap) {
      if (times.every(t => now - t > window)) rateMap.delete(key);
    }
  }
  return hits.length > 5;
}

export async function POST({ request }: { request: Request }) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(ip)) {
    return Response.json({ error: 'Příliš mnoho požadavků.' }, { status: 429 });
  }

  const data = await request.json();

  // Honeypot
  if (data._hp) return Response.json({ success: true });

  const { name, email, phone, 'project-type': type, website, message } = data;

  if (!name || !email) {
    return Response.json({ error: 'Chybí povinné pole' }, { status: 400 });
  }

  const transporter = nodemailer.createTransport({
    host: import.meta.env.SMTP_HOST,
    port: Number(import.meta.env.SMTP_PORT),
    secure: Number(import.meta.env.SMTP_PORT) === 465,
    auth: {
      user: import.meta.env.SMTP_USER,
      pass: import.meta.env.SMTP_PASS,
    },
  });

  const body = `
Nová poptávka z hezkewebovky.cz
================================
Jméno:         ${name}
Email:         ${email}
Telefon:       ${phone || '–'}
Typ projektu:  ${type || '–'}
Stávající web: ${website || '–'}

Zpráva:
${message || '–'}
`.trim();

  try {
    await transporter.sendMail({
      from: `"Hezké webovky" <${import.meta.env.SMTP_FROM}>`,
      to: import.meta.env.MAIL_TO,
      replyTo: email,
      subject: `Poptávka: ${name}`,
      text: body,
    });
  } catch (err) {
    console.error('SMTP error:', err);
    return Response.json({ error: 'Email se nepodařilo odeslat' }, { status: 500 });
  }

  return Response.json({ success: true });
}
