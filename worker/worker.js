// Jarvis reminder server for Cloudflare Workers (free plan is enough).
// Needs: a KV namespace bound as JARVIS_KV, a secret/variable named API_TOKEN,
// and a cron trigger "* * * * *". See README.md.

const enc = new TextEncoder();

const b64u = (buf) => {
  let s = '';
  new Uint8Array(buf).forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization,content-type',
  'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
};
const out = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, 'content-type': 'application/json' } });

const read = async (env, k, d) => (await env.JARVIS_KV.get(k, { type: 'json' })) ?? d;
const write = (env, k, v) => env.JARVIS_KV.put(k, JSON.stringify(v));

// VAPID keys are created once, on first use, and kept in KV.
async function keys(env) {
  const saved = await read(env, 'vapid', null);
  if (saved) return saved;
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const priv = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const pub = b64u(await crypto.subtle.exportKey('raw', pair.publicKey));
  const k = { priv, pub };
  await write(env, 'vapid', k);
  return k;
}

// Sends an empty push. The service worker then asks /pending for the actual text.
async function push(env, sub) {
  const { priv, pub } = await keys(env);
  const aud = new URL(sub.endpoint).origin;
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify({
    aud,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.CONTACT || 'mailto:admin@example.com',
  })));
  const key = await crypto.subtle.importKey('jwk', priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(head + '.' + body));
  return fetch(sub.endpoint, {
    method: 'POST',
    headers: { Authorization: 'vapid t=' + head + '.' + body + '.' + b64u(sig) + ', k=' + pub, TTL: '86400', Urgency: 'high' },
  });
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (!env.API_TOKEN || req.headers.get('authorization') !== 'Bearer ' + env.API_TOKEN) {
      return out({ error: 'Wrong or missing access token.' }, 401);
    }
    const url = new URL(req.url);
    const p = url.pathname;
    try {
      if (p === '/vapid') return out({ publicKey: (await keys(env)).pub });

      if (p === '/subscribe' && req.method === 'POST') {
        await write(env, 'sub', await req.json());
        return out({ ok: true });
      }

      if (p === '/reminders') return out({ items: await read(env, 'reminders', []) });

      if (p === '/remind' && req.method === 'POST') {
        const b = await req.json();
        if (!b.text || !b.due) return out({ error: 'text and due are required' }, 400);
        const list = await read(env, 'reminders', []);
        list.push({ id: b.id || crypto.randomUUID(), text: String(b.text).slice(0, 300), due: Number(b.due) });
        await write(env, 'reminders', list);
        return out({ ok: true });
      }

      if (p === '/remind' && req.method === 'DELETE') {
        const id = url.searchParams.get('id');
        const list = await read(env, 'reminders', []);
        await write(env, 'reminders', list.filter((r) => r.id !== id));
        return out({ ok: true });
      }

      if (p === '/pending') {
        const items = await read(env, 'pending', []);
        if (items.length) await write(env, 'pending', []);
        return out({ items });
      }

      if (p === '/test' && req.method === 'POST') {
        const sub = await read(env, 'sub', null);
        if (!sub) return out({ error: 'No phone is subscribed yet. Tap Turn on notifications first.' }, 400);
        const pending = await read(env, 'pending', []);
        pending.push({ id: 'test-' + Date.now(), text: 'Systems online, Sir.' });
        await write(env, 'pending', pending);
        const r = await push(env, sub);
        return out({ status: r.status });
      }

      return out({ error: 'Not found' }, 404);
    } catch (e) {
      return out({ error: String((e && e.message) || e) }, 500);
    }
  },

  // Runs every minute (cron trigger). Moves due reminders to "pending" and pings the phone.
  async scheduled(_event, env) {
    const now = Date.now();
    const list = await read(env, 'reminders', []);
    const due = list.filter((r) => r.due <= now);
    if (!due.length) return;
    await write(env, 'reminders', list.filter((r) => r.due > now));
    const pending = await read(env, 'pending', []);
    await write(env, 'pending', [...pending, ...due.map((r) => ({ id: r.id, text: r.text }))]);
    const sub = await read(env, 'sub', null);
    if (!sub) return;
    const res = await push(env, sub);
    if (res.status === 404 || res.status === 410) await env.JARVIS_KV.delete('sub');
  },
};
