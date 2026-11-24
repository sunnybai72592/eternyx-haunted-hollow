// Staging rehearsal: hard-disabled regardless of configuration.
import { createEvidenceHandler } from "./handler.mjs";
Deno.serve(createEvidenceHandler({url:"",publicKey:"",serviceKey:"",enabled:false}));
