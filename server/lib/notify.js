// Messaging adapter. In dev it logs; with env credentials it uses the
// WhatsApp Cloud API (Meta) for OTPs. SMS / voice providers plug in here too.
export async function sendOtp(mobile, code, lang = 'en') {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const template = process.env.WHATSAPP_OTP_TEMPLATE || 'sethu_otp';
  if (!token || !phoneId) {
    if (process.env.NODE_ENV !== 'test') console.log(`[sethu] OTP for ${mobile}: ${code} (dev mode — no provider configured)`);
    return { channel: 'dev' };
  }
  const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: `91${mobile}`,
      type: 'template',
      template: {
        name: template,
        language: { code: lang === 'ta' ? 'ta' : 'en' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: code }] },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
        ],
      },
    }),
  });
  if (!res.ok) throw new Error(`WhatsApp send failed: ${res.status}`);
  return { channel: 'whatsapp' };
}
