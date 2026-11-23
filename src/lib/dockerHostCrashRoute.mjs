// Shared read-only host routing admission for a recovery triage.
import {validateHostRouteEvidence} from "./dockerHostNetworkEvidence.mjs";
export function validateDockerHostRouteEvidence(routes,ipv4Forwarding,ipv6Forwarding){
 if(!routes||typeof routes!=="object"||Array.isArray(routes)||
  typeof ipv4Forwarding!=="string"||typeof ipv6Forwarding!=="string"||
  ipv4Forwarding.trim()!=="0"||ipv6Forwarding.trim()!=="0")
  throw Error("Crash triage requires IPv4/IPv6 kernel forwarding disabled.");
 return validateHostRouteEvidence(routes.v4,routes.v6);
}
