import { createClient } from '@base44/sdk';
import fs from 'node:fs';

const { email, password } = JSON.parse(fs.readFileSync('.tmp-proof/base44-proof-creds.json', 'utf8'));
const base44 = createClient({ appId: '69c16c52c86d161e74940243' });

try {
  const response = await base44.auth.login({ email, password });
  console.log(JSON.stringify({ ok: true, response_type: typeof response, response_keys: response && typeof response === 'object' ? Object.keys(response) : [] }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, status: error?.response?.status ?? null, message: error?.message ?? String(error), data: error?.response?.data ?? null }, null, 2));
  process.exit(1);
}
