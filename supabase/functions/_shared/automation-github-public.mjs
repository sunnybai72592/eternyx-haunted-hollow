/**
 * Hard allowlist for Automation's FIRST external provider.
 * One public GitHub repository metadata GET. No tokens, arbitrary URLs, writes,
 * redirect following, webhooks, paginated searches, or other providers.
 */
export const GH_OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
export const GH_REPO = /^[A-Za-z0-9_.-]{1,100}$/;
export const GH_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = {
  status: ["action"],
  configure: ["action","enabled","dailyLimit"],
  inspect: ["action","owner","repo","requestKey"],
  history: ["action"],
};
export function validateGitHubName(owner,repo) {
  return typeof owner==="string" && owner.length<=39 && GH_OWNER.test(owner) &&
    typeof repo==="string" && repo!=="." && repo!==".." && GH_REPO.test(repo);
}
export function parseGitHubIntegrationRequest(value) {
  if (!value || typeof value!=="object" || Array.isArray(value) ||
      !Object.prototype.hasOwnProperty.call(ACTIONS,value.action)) {
    return {ok:false,reason:"invalid_action"};
  }
  if (Object.keys(value).some(k=>!ACTIONS[value.action].includes(k))) {
    return {ok:false,reason:"unexpected_field"};
  }
  if (value.action==="configure") {
    if (typeof value.enabled!=="boolean" ||
        !Number.isInteger(value.dailyLimit) || value.dailyLimit<1 || value.dailyLimit>20) {
      return {ok:false,reason:"invalid_policy"};
    }
    return {ok:true,action:"configure",enabled:value.enabled,dailyLimit:value.dailyLimit};
  }
  if (value.action==="inspect") {
    if (!validateGitHubName(value.owner,value.repo) ||
        typeof value.requestKey!=="string" || !GH_UUID.test(value.requestKey)) {
      return {ok:false,reason:"invalid_repository"};
    }
    return {ok:true,action:"inspect",owner:value.owner,repo:value.repo,requestKey:value.requestKey};
  }
  return {ok:true,action:value.action};
}
export function sanitizeGitHubRepo(raw,requestedOwner,requestedRepo) {
  if (!raw || typeof raw!=="object" || Array.isArray(raw) || raw.private!==false ||
      !validateGitHubName(raw.owner?.login,raw.name) ||
      typeof raw.full_name!=="string" ||
      raw.full_name.toLowerCase() !==
        (requestedOwner+"/"+requestedRepo).toLowerCase() ||
      typeof raw.stargazers_count!=="number" || !Number.isSafeInteger(raw.stargazers_count) ||
      raw.stargazers_count<0 ||
      typeof raw.forks_count!=="number" || !Number.isSafeInteger(raw.forks_count) ||
      raw.forks_count<0 ||
      typeof raw.open_issues_count!=="number" || !Number.isSafeInteger(raw.open_issues_count) ||
      raw.open_issues_count<0 ||
      typeof raw.archived!=="boolean") {
    throw new Error("upstream_invalid");
  }
  const nullable=(value,max)=>{
    if (value===null || value===undefined) return null;
    if (typeof value!=="string") throw new Error("upstream_invalid");
    return value.slice(0,max);
  };
  const language=nullable(raw.language,80);
  const description=nullable(raw.description,280);
  const defaultBranch=nullable(raw.default_branch,100);
  const url="https://github.com/"+encodeURIComponent(raw.owner.login)+"/"+encodeURIComponent(raw.name);
  return {
    name:raw.name,
    fullName:raw.owner.login+"/"+raw.name,
    description,
    stars:raw.stargazers_count,
    forks:raw.forks_count,
    openIssues:raw.open_issues_count,
    language,
    archived:raw.archived,
    defaultBranch,
    url,
  };
}
async function readJsonBounded(response,limit=50000) {
  const length=Number(response.headers.get("content-length")??0);
  if (length>limit) throw new Error("upstream_invalid");
  if (!/^application\/json\b/i.test(response.headers.get("content-type")??"")) {
    throw new Error("upstream_invalid");
  }
  if (!response.body) throw new Error("upstream_invalid");
  const reader=response.body.getReader();
  let size=0;
  const chunks=[];
  try {
    while (true) {
      const {value,done}=await reader.read();
      if (done) break;
      size+=value.byteLength;
      if (size>limit) throw new Error("upstream_invalid");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(()=>undefined);
    throw error;
  }
  const data=new Uint8Array(size);
  let off=0;
  for (const c of chunks) {data.set(c,off);off+=c.byteLength;}
  try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(data));}
  catch {throw new Error("upstream_invalid");}
}
/**
 * Provider calls are deliberately isolated behind injectable fetch for
 * deterministic regression tests. No caller-supplied host/path allowed.
 */
export async function fetchGitHubPublicRepo(owner,repo,fetcher=fetch) {
  if (!validateGitHubName(owner,repo)) return {ok:false,errorCode:"upstream_invalid",httpStatus:null};
  const endpoint="https://api.github.com/repos/"+encodeURIComponent(owner)+"/"+encodeURIComponent(repo);
  let response;
  try {
    response=await fetcher(endpoint,{
      method:"GET",
      redirect:"error",
      credentials:"omit",
      headers:{
        "Accept":"application/vnd.github+json",
        "X-GitHub-Api-Version":"2022-11-28",
        "User-Agent":"ETERNYX-Automation-Public-Metadata",
      },
      signal:AbortSignal.timeout(6500),
    });
  } catch (e) {
    return {ok:false,errorCode:e?.name==="TimeoutError" || e?.name==="AbortError"
      ? "request_timeout":"provider_unavailable",httpStatus:null};
  }
  if (response.status!==200) {
    if (response.body) await response.body.cancel().catch(()=>undefined);
    return {ok:false,httpStatus:response.status,
      errorCode:response.status===404?"not_found":
      response.status===429 || (response.status===403 && response.headers.get("x-ratelimit-remaining")==="0")
        ? "provider_rate_limited":"provider_unavailable"};
  }
  try {
    const payload=await readJsonBounded(response);
    const safe=sanitizeGitHubRepo(payload,owner,repo);
    return {ok:true,httpStatus:200,result:safe};
  } catch {
    return {ok:false,httpStatus:200,errorCode:"upstream_invalid"};
  }
}
