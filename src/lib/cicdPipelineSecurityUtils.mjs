const MAX_WORKFLOW_LENGTH = 100000;
const RULES = [
 { id:"PERMISSIONS_MISSING", severity:"medium", title:"Explicit workflow permissions are missing", description:"No top-level permissions policy was detected; repository defaults may grant broader access than required.", recommendation:"Declare permissions: {} and grant only minimum job-level scopes." },
 { id:"PERMISSIONS_WRITE_ALL", severity:"critical", title:"Broad write-all permissions", description:"The workflow grants write access across all available permission scopes.", recommendation:"Replace write-all with an explicit least-privilege permissions map." },
 { id:"UNPINNED_ACTION", severity:"high", title:"Action or reusable workflow is not pinned to a full commit SHA", description:"A mutable tag or branch can change without a workflow review.", recommendation:"Pin external actions and reusable workflows to verified full 40-character commit SHAs." },
 { id:"CHECKOUT_PERSIST_CREDENTIALS", severity:"high", title:"Checkout persists the GitHub token", description:"The checkout token remains in local Git configuration for later commands.", recommendation:"Set persist-credentials: false unless authenticated Git operations are required." },
 { id:"PULL_REQUEST_TARGET_CHECKOUT", severity:"critical", title:"Privileged pull_request_target checks out untrusted code", description:"A privileged workflow checks out a pull-request head ref, risking token or secret exposure.", recommendation:"Do not execute pull-request code in pull_request_target. Use unprivileged pull_request validation." },
 { id:"EXPRESSION_INJECTION", severity:"critical", title:"Untrusted event data is interpolated into a shell command", description:"Attacker-controlled event data appears directly in a run command.", recommendation:"Pass untrusted values through environment variables, quote them, and validate before use." },
 { id:"SECRET_LOGGING", severity:"high", title:"Potential secret output in a shell command", description:"A shell logging command appears to print a secrets context value.", recommendation:"Never log secret values; rotate any credential that may have been exposed." },
 { id:"SECRETS_INHERIT", severity:"medium", title:"Reusable workflow inherits all caller secrets", description:"secrets: inherit passes all available caller secrets to the called workflow.", recommendation:"Pass only the named secrets required by the reusable workflow." }
];
function lineNumberAt(source,index){return source.slice(0,index).split("\n").length;}
export function analyzeWorkflowSecurity(input){
 const source=String(input??"");
 if(!source.trim()) throw new Error("Paste a GitHub Actions workflow to analyze.");
 if(source.length>MAX_WORKFLOW_LENGTH) throw new Error("Workflow input must be 100,000 characters or fewer.");
 const findings=[];
 const add=(id,index,evidence)=>{const rule=RULES.find(item=>item.id===id);if(rule)findings.push({...rule,line:lineNumberAt(source,index),evidence:String(evidence).trim().slice(0,240)});};
 if(!/^permissions\s*:/m.test(source)) add("PERMISSIONS_MISSING",0,"No top-level permissions block detected.");
 let match=/^permissions\s*:\s*write-all\b/m.exec(source);if(match)add("PERMISSIONS_WRITE_ALL",match.index,match[0]);
 const actionPattern=/^\\s*(?:-\\s*)?uses:\\s*([^\\s#]+)\\s*$/gm;
 while((match=actionPattern.exec(source))){const target=match[1].replace(/^['"]|['"]$/g,"");if(target.startsWith("./"))continue;const at=target.lastIndexOf("@");const revision=at>=0?target.slice(at+1):"";if(!/^[a-f0-9]{40}$/i.test(revision))add("UNPINNED_ACTION",match.index,match[0]);}
 const persistPattern=/^\s*persist-credentials:\s*true\s*$/gm;while((match=persistPattern.exec(source)))add("CHECKOUT_PERSIST_CREDENTIALS",match.index,match[0]);
 const trigger=/^\s*pull_request_target\s*:/m.exec(source);
 const checkout=/^\s*ref:\s*\$\{\{\s*github\.event\.pull_request\.(?:head\.sha|head\.ref)\s*\}\}/m.exec(source);
 if(trigger&&checkout)add("PULL_REQUEST_TARGET_CHECKOUT",checkout.index,checkout[0]);
 const lines=source.split("\n");let offset=0;let inRun=false;let runIndent=0;
 for(const line of lines){const indent=(line.match(/^\s*/)||[""])[0].length;if(/^\s*run\s*:\s*[|>][-+]?\s*$/.test(line)){inRun=true;runIndent=indent;}else if(inRun&&line.trim()&&indent<=runIndent&&!/^\s*#/.test(line)){inRun=false;}
 const isRun=/^\s*run\s*:/.test(line)||inRun;
 if(isRun&&/\$\{\{\s*github\.event\.(?:pull_request\.(?:title|body|head\.ref)|issue\.(?:title|body)|comment\.body|discussion\.title|review\.body)\s*\}\}/i.test(line))add("EXPRESSION_INJECTION",offset,line);
 if(isRun&&/\b(?:echo|printf|print)\b/i.test(line)&&/\$\{\{\s*secrets\.[^}]+\}\}/i.test(line))add("SECRET_LOGGING",offset,line);
 offset+=line.length+1;}
 const inherited=/^\s*secrets:\s*inherit\s*$/gm;while((match=inherited.exec(source)))add("SECRETS_INHERIT",match.index,match[0]);
 const rank={critical:0,high:1,medium:2,low:3};findings.sort((a,b)=>rank[a.severity]-rank[b.severity]||a.line-b.line||a.id.localeCompare(b.id));
 return {findings,summary:{total:findings.length,critical:findings.filter(x=>x.severity==="critical").length,high:findings.filter(x=>x.severity==="high").length,medium:findings.filter(x=>x.severity==="medium").length},scannedCharacters:source.length};
}
