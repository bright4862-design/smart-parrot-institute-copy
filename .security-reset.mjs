import fs from 'node:fs';
import { createClient } from '@base44/sdk';
const appId = process.env.VITE_BASE44_APP_ID || '69c16c52c86d161e74940243';
const { email } = JSON.parse(fs.readFileSync('/app/.tmp-proof/base44-proof-creds.json', 'utf8'));
const client = createClient({ appId });
await client.auth.resetPasswordRequest(email);
console.log(JSON.stringify({ reset_requested: true, app_id: appId }, null, 2));
