import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const STAGING_REF = 'mhodwvypfbxafamkrgsk';
export const PRODUCTION_REF = 'wcncuarekaofmfurbtbh';
export const REQUIRED = Object.freeze([
  'cybersecurity-isolation', 'workspace-four-role-collaboration',
  'automation-two-owner-workflow', 'education-exam-journey',
  'services-customer-admin-journey', 'backend-migration-parity',
  'backend-function-parity', 'developer-studio-real-tools',
  'ai-arsenal-real-tools', 'ai-video-real-export', 'labs-isolated-execution',
  'cloud-isolated-control', 'account-auth-session', 'subscription-sandbox',
  'desktop-browser', 'mobile-browser', 'monitoring-recovery', 'rollback-rehearsal',
]);
const sha = /^[a-f0-9]{40}$/;
const digest = /^[a-f0-9]{64}$/;
const actor = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/;
const run = /^[1-9][0-9]{0,19}$/;
const utc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_AGE = 7 * 86400_000;
const validDate = v => typeof v === 'string' && utc.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const exactKeys = (o, keys) => o && typeof o === 'object' && !Array.isArray(o) &&
  Object.keys(o).length === keys.length && keys.every(k => Object.hasOwn(o,k));
const fields = ['gate','status','candidate','stagingRef','runId','artifactSha256','observedAt','operator','reviewer','reviewedAt'];
export function checkEvidence(input, candidate, now = Date.now()) {
  const failures = [];
  if (!sha.test(candidate ?? '') || !Number.isFinite(now)) return {status:'HOLD',failures:['INVALID_EXPECTED_CANDIDATE'],productionAuthorized:false};
  if (!exactKeys(input,['schemaVersion','candidate','stagingRef','evidence']) ||
      input.schemaVersion !== 1 || input.candidate !== candidate ||
      input.stagingRef !== STAGING_REF || !Array.isArray(input.evidence) || input.evidence.length > REQUIRED.length)
    return {status:'HOLD',failures:['INVALID_MANIFEST'],productionAuthorized:false};
  const seen = new Set();
  for (const item of input.evidence) {
    if (!exactKeys(item,fields) || !REQUIRED.includes(item.gate)) { failures.push('INVALID_EVIDENCE_ROW'); continue; }
    const g = item.gate;
    if (seen.has(g)) { failures.push(g+':DUPLICATE'); continue; }
    seen.add(g);
    if (item.status !== 'PASS' || item.candidate !== candidate || item.stagingRef !== STAGING_REF ||
        typeof item.runId !== 'string' || !run.test(item.runId) ||
        typeof item.artifactSha256 !== 'string' || !digest.test(item.artifactSha256) ||
        typeof item.operator !== 'string' || !actor.test(item.operator) ||
        typeof item.reviewer !== 'string' || !actor.test(item.reviewer) ||
        item.operator.toLowerCase() === item.reviewer.toLowerCase() ||
        !validDate(item.observedAt) || !validDate(item.reviewedAt) ||
        Date.parse(item.observedAt) < now-MAX_AGE || Date.parse(item.observedAt) > now ||
        Date.parse(item.reviewedAt) < Date.parse(item.observedAt) || Date.parse(item.reviewedAt) > now)
      failures.push(g+':UNQUALIFIED');
  }
  for (const g of REQUIRED) if (!seen.has(g)) failures.push(g+':MISSING');
  return {status:failures.length?'HOLD':'READY_FOR_INDEPENDENT_REVIEW',failures,productionAuthorized:false};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const file = readFileSync(process.argv[2]);
    if (file.length > 128*1024) throw new Error('size');
    const report = checkEvidence(JSON.parse(file.toString('utf8')),process.argv[3]);
    console.log(JSON.stringify(report));
    // This is a structural check only. It cannot authorize or perform production deployment.
    process.exitCode = report.status === 'HOLD' ? 1 : 0;
  } catch {
    console.log(JSON.stringify({status:'HOLD',failures:['INVALID_INPUT'],productionAuthorized:false}));
    process.exitCode = 1;
  }
}
