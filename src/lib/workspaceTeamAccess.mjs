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
