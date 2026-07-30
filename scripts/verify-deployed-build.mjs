import assert from 'node:assert/strict';

const baseUrl = (process.env.DEPLOY_URL || '').replace(/\/$/, '');
const expectedSha = process.env.EXPECTED_SHA || '';
if (!baseUrl) throw new Error('DEPLOY_URL is required');
if (!/^[0-9a-f]{40}$/i.test(expectedSha)) throw new Error('EXPECTED_SHA must be a full SHA');

const response = await fetch(`${baseUrl}/build-info.json`, { cache: 'no-store' });
assert.equal(response.ok, true, `build-info returned ${response.status}`);
const cacheControl = response.headers.get('cache-control') || '';
assert.match(cacheControl, /no-store/i, 'build-info.json must be served with Cache-Control: no-store');
const info = await response.json();
assert.equal(info.git_sha, expectedSha, `served SHA ${info.git_sha} does not match ${expectedSha}`);
if (process.env.EXPECTED_ARTIFACT_DIGEST) assert.equal(info.artifact_digest, process.env.EXPECTED_ARTIFACT_DIGEST);
if (process.env.EXPECTED_DEPLOYMENT_REVISION) assert.equal(info.deployment_revision, process.env.EXPECTED_DEPLOYMENT_REVISION);
console.log(JSON.stringify(info, null, 2));
