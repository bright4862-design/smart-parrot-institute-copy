import { createClient } from '@base44/sdk';
import fs from 'node:fs';
const appId='69c16c52c86d161e74940243';
const {email,password}=JSON.parse(fs.readFileSync('.tmp-proof/base44-proof-creds.json','utf8'));
const base44=createClient({appId});
try {
  const login=await base44.auth.loginViaEmailPassword(email,password);
  const me=await base44.auth.me();
  console.log(JSON.stringify({ok:true,loginKeys:login&&typeof login==='object'?Object.keys(login):[],me:{id:me?.id,email:me?.email,role:me?.role,is_verified:me?.is_verified}},null,2));
} catch (e) {
  console.log(JSON.stringify({ok:false,status:e?.response?.status??null,message:e?.message??String(e),data:e?.response?.data??null},null,2));
}
process.exit(0);
