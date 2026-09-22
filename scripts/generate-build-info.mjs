import fs from 'node:fs';
import path from 'node:path';

const fullSha = process.env.GIT_SHA || process.env.GITHUB_SHA || '';
if (!/^[0-9a-f]{40}$/i.test(fullSha)) throw new Error('GIT_SHA must be a full 40-character SHA');

const info = {
  git_sha: fullSha,
  git_ref: process.env.GIT_REF || process.env.GITHUB_REF || 'unknown',
  build_timestamp: process.env.BUILD_TIMESTAMP || new Date().toISOString(),
  environment: process.env.DEPLOY_ENVIRONMENT || 'ci',
  release_version: process.env.RELEASE_VERSION || 'unreleased',
  repository: process.env.GITHUB_REPOSITORY || 'bright4862-design/smart-parrot-institute-copy',
  deployment_revision: process.env.DEPLOYMENT_REVISION || null,
  artifact_digest: process.env.ARTIFACT_DIGEST || null,
};

const outputDir = path.resolve('dist');
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'build-info.json'), JSON.stringify(info, null, 2) + '\n');
console.log(JSON.stringify(info));
