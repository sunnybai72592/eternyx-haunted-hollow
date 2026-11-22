/**
 * GitHub fine-grained PAT issue creation boundary. Credentials never enter
 * client-visible responses, logs or DB plaintext. No arbitrary URL/method.
 */
import { validateGitHubName, GH_UUID } from "./automation-github-public.mjs";
export const ISSUE_TITLE_MAX = 120;
export const ISSUE_BODY_MAX = 1000;
export const ISSUE_PAYLOAD_BYTES = 2200;
const PAT = /^github_pat_[A-Za-z0-9_]{20,300}$/;
const allow = {
  status:["action"],
  connect:["action","owner","repo","token"],
  toggle:["action","enabled"],
  disconnect:["action"],
  prepare:["action","title","body","requestKey"],
  list:["action"],
  preview:["action","draftId"],
  approve:["action","draftId"],
  reject:["action","draftId"],
};
function plain(value){return !!value && typeof value==="object"&&!Array.isArray(value);}
export function parseGitHubIssueAction(value) {
  if(!plain(value)||!Object.prototype.hasOwnProperty.call(allow,value.action)||
      Object.keys(value).some(k=>!allow[value.action].includes(k))) {
    return {ok:false,reason:"invalid_action"};
  }
  const action=value.action;
  if(action==="connect"){
    if(!validateGitHubName(value.owner,value.repo) ||
       typeof value.token!=="string" || value.token.length>320 ||
       !PAT.test(value.token))return {ok:false,reason:"invalid_connection"};
    return {ok:true,action,owner:value.owner,repo:value.repo,token:value.token};
  }
  if(action==="toggle"){
    if(typeof value.enabled!=="boolean")return {ok:false,reason:"invalid_toggle"};
    return {ok:true,action,enabled:value.enabled};
  }
  if(action==="prepare"){
    if(typeof value.title!=="string" || value.title.trim().length<1 ||
      value.title.trim().length>ISSUE_TITLE_MAX ||
      /[\x00-\x1f\x7f]/.test(value.title) ||
      typeof value.body!=="string" || value.body.length>ISSUE_BODY_MAX ||
      new TextEncoder().encode(value.body).byteLength>ISSUE_BODY_MAX ||
      typeof value.requestKey!=="string" || !GH_UUID.test(value.requestKey)) {
      return {ok:false,reason:"invalid_issue_draft"};
    }
    return {ok:true,action,title:value.title.trim(),body:value.body,requestKey:value.requestKey};
  }
  if(["preview","approve","reject"].includes(action)){
    if(typeof value.draftId!=="string"||!GH_UUID.test(value.draftId)){
      return {ok:false,reason:"invalid_draft_id"};
    }
    return {ok:true,action,draftId:value.draftId};
  }
  return {ok:true,action};
}
export function validFineGrainedToken(token){return typeof token==="string" && PAT.test(token);}
export async function issueFingerprint(userId,owner,repo,version,title,body) {
  const raw=new TextEncoder().encode(JSON.stringify([
    userId,owner.toLowerCase(),repo.toLowerCase(),version,title,body,
  ]));
  const digest=await crypto.subtle.digest("SHA-256",raw);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function githubHeaders(token){
  return {
    "Accept":"application/vnd.github+json",
    "Authorization":"Bearer "+token,
    "X-GitHub-Api-Version":"2022-11-28",
    "User-Agent":"ETERNYX-Approved-Issues",
  };
}
async function limitedJson(response,max=65536){
  if(!/^application\/json\b/i.test(response.headers.get("content-type")??"")) {
    throw Error("github_invalid_response");
  }
  const indicated=Number(response.headers.get("content-length")??"0");
  if(!Number.isFinite(indicated)||indicated>max)throw Error("github_invalid_response");
  if(!response.body)throw Error("github_invalid_response");
  const reader=response.body.getReader(),parts=[];
  let size=0;
  try{
    while(true){
      const {value,done}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>max)throw Error("github_invalid_response");
      parts.push(value);
    }
  } catch(error){await reader.cancel().catch(()=>undefined);throw error;}
  const all=new Uint8Array(size);let at=0;
  for(const part of parts){all.set(part,at);at+=part.byteLength;}
  try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(all));}
  catch{throw Error("github_invalid_response");}
}
export async function verifyIssueConnection(token,owner,repo,fetcher=fetch){
  if(!validFineGrainedToken(token)||!validateGitHubName(owner,repo)){
    return {ok:false,reason:"invalid_connection"};
  }
  const url="https://api.github.com/repos/"+encodeURIComponent(owner)+"/"+encodeURIComponent(repo);
  try{
    const response=await fetcher(url,{
      method:"GET",redirect:"error",credentials:"omit",
      headers:githubHeaders(token),signal:AbortSignal.timeout(6500),
    });
    if(response.status!==200){
      if(response.body)await response.body.cancel().catch(()=>undefined);
      return {ok:false,reason:response.status===401||response.status===403
        ?"credential_denied":"repository_unavailable"};
    }
    const raw=await limitedJson(response);
    if(!raw||typeof raw!=="object"||typeof raw.full_name!=="string"||
       raw.full_name.toLowerCase()!==(owner+"/"+repo).toLowerCase() ||
       raw.has_issues!==true ||
       typeof raw.owner?.login!=="string"||raw.owner.login.length>80){
      return {ok:false,reason:"repository_unavailable"};
    }
    return {ok:true,login:raw.owner.login};
  }catch{return {ok:false,reason:"verification_unavailable"};}
}
/**
 * The ONLY outbound write in Automation 2G. A POST error/timeout can have
 * occurred after GitHub committed the issue; no automatic retry is permitted.
 */
export async function createApprovedGitHubIssue(token,owner,repo,title,body,fetcher=fetch){
  if(!validFineGrainedToken(token)||!validateGitHubName(owner,repo)||
     typeof title!=="string"||title.length<1||title.length>ISSUE_TITLE_MAX ||
     typeof body!=="string"||body.length>ISSUE_BODY_MAX){
    return {state:"failed",code:"github_validation"};
  }
  const url="https://api.github.com/repos/"+encodeURIComponent(owner)+"/"+
    encodeURIComponent(repo)+"/issues";
  let response;
  try{
    response=await fetcher(url,{
      method:"POST",redirect:"error",credentials:"omit",
      headers:{...githubHeaders(token),"Content-Type":"application/json"},
      body:JSON.stringify({title,body}),signal:AbortSignal.timeout(6500),
    });
  }catch{return {state:"uncertain",code:"network_uncertain"};}
  if(response.status!==201){
    if(response.body)await response.body.cancel().catch(()=>undefined);
    if(response.status===401||response.status===403)return {state:"failed",code:"github_forbidden"};
    if(response.status===404)return {state:"failed",code:"github_not_found"};
    if(response.status===422)return {state:"failed",code:"github_validation"};
    if(response.status===429)return {state:"failed",code:"github_rate_limit"};
    return {state:"uncertain",code:"github_unavailable"};
  }
  try{
    const raw=await limitedJson(response);
    if(!raw||!Number.isSafeInteger(raw.number)||raw.number<=0||
       raw.number>2147483647||typeof raw.html_url!=="string"||
       !/^https:\/\/github\.com\//.test(raw.html_url))throw Error("github_invalid_response");
    // Use our OWN canonical fixed-host URL; never forward arbitrary redirects.
    const expected="https://github.com/"+owner+"/"+repo+"/issues/"+raw.number;
    if(raw.html_url.toLowerCase()!==expected.toLowerCase())throw Error("github_invalid_response");
    return {state:"succeeded",number:raw.number,url:expected};
  }catch{return {state:"uncertain",code:"github_invalid_response"};}
}
