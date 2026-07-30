import { createClient } from '@base44/sdk';
import crypto from 'node:crypto';
import fs from 'node:fs';

const appId = '69c16c52c86d161e74940243';
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0,14);
const email = `londonparisbrussels+smartparrotproof${stamp}@gmail.com`;
const password = `Sp!${crypto.randomBytes(18).toString('base64url')}9z`;
const base44 = createClient({ appId });

try {
  const response = await base44.auth.register({ email, password });
  fs.writeFileSync('.tmp-proof/base44-proof-creds.json', JSON.stringify({ email, password }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ ok: true, email, response_type: typeof response, response_keys: response && typeof response === 'object' ? Object.keys(response) : [] }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, status: error?.response?.status ?? null, message: error?.message ?? String(error), data: error?.response?.data ?? null }, null, 2));
  process.exit(1);
}
