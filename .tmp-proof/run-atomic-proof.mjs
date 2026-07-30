import { createClient } from '@base44/sdk';
import fs from 'node:fs';
import crypto from 'node:crypto';

const APP_ID = '69c16c52c86d161e74940243';
const CONCURRENCY = 25;
const nowTag = new Date().toISOString().replace(/[-:.TZ]/g, '');
const runId = `atomic-proof-${nowTag}`;
const mailPassword = `Sp!${crypto.randomBytes(12).toString('hex')}`;
const basePassword = `B44!${crypto.randomBytes(12).toString('hex')}`;
const mailbox = `smartparrot-${crypto.randomBytes(6).toString('hex')}@web-library.net`;

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) throw new Error(`${options.method || 'GET'} ${url} -> ${res.status}: ${text.slice(0, 500)}`);
  return body;
}

async function createVerifiedBase44User() {
  await jsonFetch('https://api.mail.tm/accounts', {
    method: 'POST', headers: {'content-type':'application/json'},
    body: JSON.stringify({address: mailbox, password: mailPassword})
  });
  const mailToken = await jsonFetch('https://api.mail.tm/token', {
    method: 'POST', headers: {'content-type':'application/json'},
    body: JSON.stringify({address: mailbox, password: mailPassword})
  });

  const client = createClient({appId: APP_ID});
  await client.auth.register({email: mailbox, password: basePassword});

  let otp = null;
  let verificationMessage = null;
  for (let i = 0; i < 45 && !otp; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const listing = await jsonFetch('https://api.mail.tm/messages?page=1', {
      headers: {authorization: `Bearer ${mailToken.token}`}
    });
    for (const item of listing['hydra:member'] || []) {
      const msg = await jsonFetch(`https://api.mail.tm/messages/${item.id}`, {
        headers: {authorization: `Bearer ${mailToken.token}`}
      });
      const haystack = `${msg.subject || ''}\n${msg.text || ''}\n${Array.isArray(msg.html) ? msg.html.join('\n') : (msg.html || '')}`;
      const matches = [...haystack.matchAll(/\b(\d{6})\b/g)].map(m => m[1]);
      if (matches.length) {
        otp = matches[0];
        verificationMessage = {subject: msg.subject, receivedAt: msg.createdAt};
        break;
      }
    }
  }
  if (!otp) throw new Error('Base44 OTP was not received within 90 seconds');

  await client.auth.verifyOtp({email: mailbox, otpCode: otp});
  const login = await client.auth.loginViaEmailPassword(mailbox, basePassword);
  const me = await client.auth.me();
  return {client, me, loginKeys: Object.keys(login || {}), verificationMessage};
}

function countFrom(result) {
  if (!result || typeof result !== 'object') return null;
  for (const key of ['modifiedCount','matchedCount','count','updated','updated_count']) {
    if (Number.isInteger(result[key])) return result[key];
  }
  if (Array.isArray(result)) return result.length;
  return null;
}

async function settle(label, promises) {
  const started = Date.now();
  const settled = await Promise.allSettled(promises);
  return {
    label,
    duration_ms: Date.now() - started,
    fulfilled: settled.filter(x => x.status === 'fulfilled').length,
    rejected: settled.filter(x => x.status === 'rejected').length,
    results: settled.map((x, i) => x.status === 'fulfilled'
      ? {index: i, status: 'fulfilled', value: x.value, count: countFrom(x.value)}
      : {index: i, status: 'rejected', error: x.reason?.message || String(x.reason)})
  };
}

const evidence = {
  conclusion: null,
  app_id: APP_ID,
  environment: 'Base44 active app sandbox / live entity API',
  concurrency: CONCURRENCY,
  run_id: runId,
  sdk_version: JSON.parse(fs.readFileSync('node_modules/@base44/sdk/package.json','utf8')).version,
  vite_plugin_version: JSON.parse(fs.readFileSync('node_modules/@base44/vite-plugin/package.json','utf8')).version,
  started_at: new Date().toISOString()
};

try {
  const {client, me, loginKeys, verificationMessage} = await createVerifiedBase44User();
  evidence.auth = {player_id: me.id, role: me.role, verified: me.is_verified, login_keys: loginKeys, verification_message: verificationMessage};

  // Atomic conditional update proof.
  const mission = await client.entities.AtomicMissionProof.create({
    proof_run_id: runId,
    player_id: me.id,
    revision: 0,
    checkpoint_id: 'checkpoint-start',
    completed_objective_ids: [],
    total_xp: 0,
    reward_ids: [],
    unlock_ids: [],
    completion_state: 'active',
    winning_request_id: ''
  });
  evidence.atomic_update = {primitive: 'entities.AtomicMissionProof.updateMany(query-with-revision, update-operators)', starting_record: mission};

  const cas = await settle('25 concurrent CAS updates', Array.from({length: CONCURRENCY}, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    return client.entities.AtomicMissionProof.updateMany(
      {proof_run_id: runId, player_id: me.id, revision: 0},
      {
        $set: {checkpoint_id: `checkpoint-${n}`, winning_request_id: `cas-${n}`},
        $addToSet: {
          completed_objective_ids: `objective-${n}`,
          reward_ids: `reward-${n}`,
          unlock_ids: `unlock-${n}`
        },
        $inc: {revision: 1, total_xp: 10}
      }
    );
  }));
  const finalMissionList = await client.entities.AtomicMissionProof.filter({proof_run_id: runId, player_id: me.id});
  const finalMission = finalMissionList[0] || null;
  const casSuccesses = cas.results.filter(r => r.status === 'fulfilled' && r.count === 1);
  const casZeroes = cas.results.filter(r => r.status === 'fulfilled' && r.count === 0);
  evidence.atomic_update.concurrent = cas;
  evidence.atomic_update.success_count = casSuccesses.length;
  evidence.atomic_update.conflict_equivalent_zero_match_count = casZeroes.length;
  evidence.atomic_update.rejected_count = cas.rejected;
  evidence.atomic_update.winning_request = finalMission?.winning_request_id || null;
  evidence.atomic_update.starting_revision = 0;
  evidence.atomic_update.final_revision = finalMission?.revision ?? null;
  evidence.atomic_update.final_authoritative_record = finalMission;
  evidence.atomic_update.no_losing_write_proof = finalMission ? {
    objective_count: finalMission.completed_objective_ids?.length,
    reward_count: finalMission.reward_ids?.length,
    unlock_count: finalMission.unlock_ids?.length,
    total_xp: finalMission.total_xp,
    completion_state: finalMission.completion_state
  } : null;

  // Explicit stale revision after the winner.
  const stale = await client.entities.AtomicMissionProof.updateMany(
    {proof_run_id: runId, player_id: me.id, revision: 0},
    {$set: {checkpoint_id: 'checkpoint-stale', winning_request_id: 'stale-request'}, $inc: {revision: 1, total_xp: 999}}
  );
  evidence.stale_revision = {raw_result: stale, matched_or_modified_count: countFrom(stale)};

  // Atomic first-create proof: all calls target the same logical player key.
  const logicalPlayerKey = `player-progress:${me.id}`;
  const createRun = await settle('25 concurrent first creates', Array.from({length: CONCURRENCY}, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    return client.entities.AtomicPlayerProof.create({
      proof_run_id: runId,
      logical_player_key: logicalPlayerKey,
      player_id: me.id,
      revision: 1,
      total_xp: 0,
      reward_ids: [],
      unlock_ids: [],
      receipt_id: `first-create:${me.id}:shared-key`,
      request_id: `create-${n}`
    });
  }));
  const playerRecords = await client.entities.AtomicPlayerProof.filter({proof_run_id: runId, logical_player_key: logicalPlayerKey, player_id: me.id});
  evidence.first_create = {
    primitive: 'entities.AtomicPlayerProof.create(data) — no unique-index/upsert/create-if-absent option exposed',
    concurrent: createRun,
    final_record_count: playerRecords.length,
    final_records: playerRecords
  };

  // Concurrent logical MutationReceipt creation with the same uniqueness scope.
  const scopeKey = `${me.id}:create-player-progress:${logicalPlayerKey}:idem-shared`;
  const receiptRun = await settle('25 concurrent logical receipt creates', Array.from({length: CONCURRENCY}, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    return client.entities.AtomicReceiptProof.create({
      proof_run_id: runId,
      scope_key: scopeKey,
      player_id: me.id,
      operation: 'create-player-progress',
      resource_id: logicalPlayerKey,
      idempotency_key: 'idem-shared',
      request_hash: 'hash-original',
      outcome: 'created',
      resulting_revision: 1,
      request_id: `receipt-${n}`
    });
  }));
  const receipts = await client.entities.AtomicReceiptProof.filter({proof_run_id: runId, scope_key: scopeKey, player_id: me.id});
  evidence.receipt_concurrency = {
    primitive: 'entities.AtomicReceiptProof.create(data) — no uniqueness guard exposed',
    concurrent: receiptRun,
    final_logical_receipt_count: receipts.length,
    final_receipts: receipts
  };

  // Same key + same payload retry.
  const retrySame = await client.entities.AtomicReceiptProof.create({
    proof_run_id: runId,
    scope_key: scopeKey,
    player_id: me.id,
    operation: 'create-player-progress',
    resource_id: logicalPlayerKey,
    idempotency_key: 'idem-shared',
    request_hash: 'hash-original',
    outcome: 'created',
    resulting_revision: 1,
    request_id: 'retry-same-payload'
  });
  // Same key + different payload.
  const reuseDifferent = await client.entities.AtomicReceiptProof.create({
    proof_run_id: runId,
    scope_key: scopeKey,
    player_id: me.id,
    operation: 'create-player-progress',
    resource_id: logicalPlayerKey,
    idempotency_key: 'idem-shared',
    request_hash: 'hash-DIFFERENT',
    outcome: 'created',
    resulting_revision: 1,
    request_id: 'reuse-different-payload'
  });
  const receiptsAfterRetries = await client.entities.AtomicReceiptProof.filter({proof_run_id: runId, scope_key: scopeKey, player_id: me.id});
  evidence.idempotency = {
    same_key_same_payload_native_result: retrySame,
    same_key_different_payload_native_result: reuseDifferent,
    final_receipt_count_after_two_retries: receiptsAfterRetries.length,
    expected_contract_behavior_was_not_enforced: true
  };

  const casPassed = casSuccesses.length === 1 && casZeroes.length === CONCURRENCY - 1 && finalMission?.revision === 1 && finalMission?.completed_objective_ids?.length === 1 && finalMission?.reward_ids?.length === 1 && finalMission?.unlock_ids?.length === 1 && finalMission?.total_xp === 10;
  const firstCreatePassed = playerRecords.length === 1;
  const receiptPassed = receipts.length === 1 && receiptsAfterRetries.length === 1;
  evidence.assertions = {atomic_conditional_update: casPassed, atomic_first_creation: firstCreatePassed, receipt_uniqueness_and_idempotency: receiptPassed};
  evidence.conclusion = casPassed && firstCreatePassed && receiptPassed ? 'Capabilities proven' : (casPassed ? 'Partially proven' : 'Not supported');
  evidence.finished_at = new Date().toISOString();
} catch (error) {
  evidence.conclusion = 'Not supported';
  evidence.fatal_error = {message: error?.message || String(error), stack: error?.stack};
  evidence.finished_at = new Date().toISOString();
}

const outPath = '.tmp-proof/atomic-capability-results.json';
fs.writeFileSync(outPath, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({
  conclusion: evidence.conclusion,
  run_id: evidence.run_id,
  auth: evidence.auth,
  atomic_update: evidence.atomic_update ? {
    success_count: evidence.atomic_update.success_count,
    zero_match_count: evidence.atomic_update.conflict_equivalent_zero_match_count,
    rejected_count: evidence.atomic_update.rejected_count,
    winner: evidence.atomic_update.winning_request,
    starting_revision: evidence.atomic_update.starting_revision,
    final_revision: evidence.atomic_update.final_revision,
    no_losing_write_proof: evidence.atomic_update.no_losing_write_proof
  } : null,
  stale_revision: evidence.stale_revision,
  first_create: evidence.first_create ? {
    fulfilled: evidence.first_create.concurrent.fulfilled,
    rejected: evidence.first_create.concurrent.rejected,
    final_record_count: evidence.first_create.final_record_count
  } : null,
  receipt_concurrency: evidence.receipt_concurrency ? {
    fulfilled: evidence.receipt_concurrency.concurrent.fulfilled,
    rejected: evidence.receipt_concurrency.concurrent.rejected,
    final_logical_receipt_count: evidence.receipt_concurrency.final_logical_receipt_count
  } : null,
  idempotency: evidence.idempotency ? {
    final_receipt_count_after_two_retries: evidence.idempotency.final_receipt_count_after_two_retries,
    expected_contract_behavior_was_not_enforced: evidence.idempotency.expected_contract_behavior_was_not_enforced
  } : null,
  assertions: evidence.assertions,
  fatal_error: evidence.fatal_error,
  results_file: outPath
}, null, 2));
process.exit(evidence.conclusion === 'Capabilities proven' ? 0 : 2);
