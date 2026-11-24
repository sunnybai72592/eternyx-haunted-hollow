import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const base=['verified-A','verified-B','distinct-owners'];
for(const label of ['A','B'])base.push('engagement-'+label,'gateway-upload-'+label,'concurrent-replay-'+label,'registered-once-'+label,'replay-rejected-'+label,'replay-no-duplicate-'+label,'download-'+label,'foreign-download-'+label,'foreign-upload-'+label);
base.push('invalid-mime','old-JWT-fresh-before-logout','logout-A','refresh-revoked-A','revoked-download-denied','old-JWT-still-unexpired','download-B-after-revocation','verified-A-new','new-session','download-A-recovered');
export function requiredChecks(phase){
 if(!['pre-cutover','post-cutover'].includes(phase))throw Error('invalid-phase');
 return [...base,...['A','B'].flatMap(label=>phase==='pre-cutover'?['pre-cutover-direct-read-'+label]:['direct-download-denied-'+label,'direct-sign-denied-'+label,'direct-upload-denied-'+label,'direct-list-denied-'+label,'direct-absent-object-denied-'+label,'download-after-direct-denials-'+label])];
}
export function assess(pre,post,now=Date.now()){
 const blockers=[];
 function validate(report,phase){
  if(!report||typeof report!=='object'){blockers.push(phase+'-missing');return null;}
  if(report.schema!=='eternyx-wave26-gateway-observation-v2'||report.project!=='mhodwvypfbxafamkrgsk'||report.phase!==phase||report.productionAuthorized!==false||report.independentlyAttested!==false||report.syntheticFixturesRetained!==true)blockers.push(phase+'-boundary');
  const time=Date.parse(report.observedAt);
  if(!Number.isFinite(time)||time>now+60000||time<now-86400000)blockers.push(phase+'-stale-or-invalid-time');
  const expected=requiredChecks(phase),actual=Array.isArray(report.checks)?report.checks:[];
  if(report.checkCount!==expected.length||actual.length!==expected.length||new Set(actual).size!==actual.length||expected.some(c=>!actual.includes(c)))blockers.push(phase+'-check-set');
  return time;
 }
 const a=validate(pre,'pre-cutover'),b=validate(post,'post-cutover');
 if(Number.isFinite(a)&&Number.isFinite(b)&&b<=a)blockers.push('cutover-order');
 return {schema:'eternyx-wave26-release-assessment-v1',stagingReportsComplete:blockers.length===0,blockers,independentlyAttested:false,productionAuthorized:false,remainingGates:['independent-review','browser-end-to-end','live-catalog-and-reconciliation','quota-exhaustion-and-load','legacy-evidence-integrity','malware-policy','backup-restore','advisor-triage']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.argv.length!==4)throw Error('usage');
  const load=path=>{const bytes=readFileSync(path);if(bytes.length>65536)throw Error('oversize');return JSON.parse(bytes.toString('utf8'));};
  const result=assess(load(process.argv[2]),load(process.argv[3]));console.log(JSON.stringify(result,null,2));
  if(!result.stagingReportsComplete)process.exitCode=1;
 }catch{console.error('Release assessment blocked: invalid input.');process.exitCode=1;}
}
