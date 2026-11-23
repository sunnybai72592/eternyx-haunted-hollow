// Phase 26: pure, fail-closed validation for browser Workspace team reconciliation.
// These checks only protect UI state. Real authorization is still enforced by
// server RLS and scoped RPCs (never trust a client cache as a security boundary).
export const TEAM_DETAIL_ACCESS_LOST="workspace_team_membership_not_verified";
const roles=new Set(["owner","editor","viewer"]);

export function chooseWorkspaceTeam(spaces,previous=null,preferred=null){
  if(!Array.isArray(spaces)||spaces.some(s=>!s||typeof s.id!=="string"||
    !s.id||typeof s.owner_id!=="string"||!s.owner_id)){
    throw Error("Workspace team list is not a verified server result");
  }
  if(new Set(spaces.map(s=>s.id)).size!==spaces.length)
    throw Error("Workspace team list contained duplicate identities");
  if(preferred&&spaces.some(s=>s.id===preferred))return preferred;
  if(previous&&spaces.some(s=>s.id===previous))return previous;
  return spaces[0]?.id??null;
}

export function verifyWorkspaceTeamDetails({
  space,owner,spaceId,members,tasks,events,invites,
}){
  if(!space||space.id!==spaceId||!owner||
    !Array.isArray(members)||!Array.isArray(tasks)||
    !Array.isArray(events)||!Array.isArray(invites)||
    [members,tasks,events,invites].some(rows=>rows.some(r=>
      !r||r.space_id!==spaceId))){
    throw Error("Workspace team scope validation failed");
  }
  const self=members.filter(m=>m.user_id===owner);
  if(self.length!==1||!roles.has(self[0].role)||
    (self[0].role==="owner")!==(space.owner_id===owner)||
    (space.owner_id!==owner&&invites.length>0)){
    const error=new Error("Workspace team membership is not verified");
    error.code=TEAM_DETAIL_ACCESS_LOST;
    throw error;
  }
  if(members.some(m=>!roles.has(m.role))||
    new Set(members.map(m=>m.user_id)).size!==members.length){
    throw Error("Workspace team members did not match authorized roles");
  }
  return self[0].role;
}

export function isWorkspaceTeamAccessLoss(error){
  return Boolean(error&&(
    error.code===TEAM_DETAIL_ACCESS_LOST||
    error.code==="42501"||
    error.status===401||error.status===403
  ));
}


// Phase 27 — preserve unsaved drafts only after actual membership verification.
export function retainWorkspaceTeamDraft(draft,role,spaceStatus,tasks) {
  if(!draft||typeof draft!=="object"||!Array.isArray(tasks)||
    !["owner","editor"].includes(role)||spaceStatus!=="active")return false;
  if(draft.id===null)return true;
  return typeof draft.id==="string"&&draft.id.length>0&&
    tasks.some(task=>task&&task.id===draft.id);
}
export function shouldQuarantineWorkspaceAuth(event,session,owner) {
  return event==="SIGNED_OUT"||
    (typeof session?.user?.id==="string"&&session.user.id!==owner);
}
export function workspaceResumeAction(visibility,inFlight,disabled=false) {
  if(disabled)return "ignore";
  if(visibility==="hidden")return "mask";
  if(visibility!=="visible")return "ignore";
  return inFlight?"queue":"revalidate";
}


// Phase 30: metadata and identity come from the SAME just-fetched list
// snapshot that governs subsequent detail reads. Never trust stale closures.
export function assertWorkspaceTeamState(space){
  if(!space||typeof space.id!=="string"||!space.id||
     typeof space.owner_id!=="string"||!space.owner_id||
     !["active","archived"].includes(space.status)){
    throw Error("Workspace team status or identity could not be verified");
  }
  return space;
}

export function requireWorkspacePreferredTeam(rows,preferred=null){
  if(preferred===null||preferred===undefined||preferred==="")return true;
  if(typeof preferred!=="string"||!Array.isArray(rows)||
     !rows.some(space=>space&&space.id===preferred)){
    throw Error("The newly created or joined Workspace team is not visible to this account");
  }
  return true;
}


// Phase 31: Data API limit(20/500) alone cannot prove the full team roster.
// Require exact PostgREST total, correct identities and zero duplicate rows.
export function verifyWorkspaceTeamCompletePage(kind,rows,count,limit,idKey){
  if(!["members","tasks"].includes(kind)||!Number.isSafeInteger(limit)||
     limit<=0||!["user_id","id"].includes(idKey)||!Array.isArray(rows)||
     !Number.isSafeInteger(count)||count<0||count>limit||
     rows.length!==count||rows.some(r=>!r||typeof r[idKey]!=="string"||!r[idKey])||
     new Set(rows.map(r=>r[idKey])).size!==rows.length){
    throw Error("Workspace "+kind+" list incomplete or untrusted; refresh before editing");
  }
  return rows;
}
// Epoch-fenced commits prevent an account switch from publishing late RPC
// receipts (including one-time invitation codes) into another user's UI.
export function isWorkspaceActionCurrent(expectedOwner,currentOwner,expectedEpoch,currentEpoch){
  return typeof expectedOwner==="string"&&!!expectedOwner&&
    expectedOwner===currentOwner&&Number.isSafeInteger(expectedEpoch)&&
    expectedEpoch>0&&expectedEpoch===currentEpoch;
}
