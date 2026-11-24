// This does not authorize or execute deployment. It classifies a read-only catalog receipt.
export function evaluateWorkspaceFreshInstallPreflight(receipt){
  const reasons=[];
  if(!receipt||typeof receipt!=="object"||Array.isArray(receipt))
    return {eligible:false,reasons:["invalid_receipt"],deployment_authorized:false};
  for(const key of ["read_only","migration_history_present","auth_users_exists","storage_objects_exists","realtime_publication_exists"])
    if(receipt[key]!==true)reasons.push(key+"_not_verified");
  if(receipt.database!=="postgres")reasons.push("database_not_verified");
  for(const key of ["applied_workspace_versions","workspace_public_relations","workspace_storage_policy_names"])
    if(!Array.isArray(receipt[key])||receipt[key].length!==0)reasons.push(key+"_not_empty_or_unverified");
  if(receipt.workspace_public_function_count!==0)reasons.push("workspace_functions_not_empty_or_unverified");
  if(receipt.workspace_bucket_exists!==false)reasons.push("workspace_bucket_not_empty_or_unverified");
  return {eligible:reasons.length===0,reasons,deployment_authorized:false};
}
