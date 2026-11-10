import test from "node:test";
import assert from "node:assert/strict";
import { analyzeApiSecurity, buildApiSecurityReport } from "../src/lib/apiSecurityIntelligenceUtils.mjs";
const json = value => JSON.stringify(value);

test("detects OpenAPI operations without security and missing schemes", () => {
 const result=analyzeApiSecurity({openApiText:json({openapi:"3.0.3",paths:{"/users":{get:{responses:{}}}}})});
 assert.ok(result.findings.some(item=>item.id==="OPENAPI_OPERATION_NO_SECURITY"&&item.severity==="high"));
 assert.ok(result.findings.some(item=>item.id==="OPENAPI_SECURITY_SCHEME_MISSING"));
});
test("accepts secured OpenAPI operations", () => {
 const result=analyzeApiSecurity({openApiText:json({openapi:"3.0.3",security:[{BearerAuth:[]}],components:{securitySchemes:{BearerAuth:{type:"http",scheme:"bearer"}}},paths:{"/me":{get:{responses:{}}}}})});
 assert.equal(result.findings.filter(item=>item.id==="OPENAPI_OPERATION_NO_SECURITY").length,0);
});
test("flags unsafe JWT validation settings", () => {
 const result=analyzeApiSecurity({jwtConfigText:json({algorithm:"none",verifySignature:false,expirationRequired:false})});
 const ids=result.findings.map(item=>item.id);
 assert.ok(ids.includes("JWT_ALGORITHM_KEY_MISMATCH"));
 assert.ok(ids.includes("JWT_SIGNATURE_VALIDATION_DISABLED"));
 assert.ok(ids.includes("JWT_EXPIRATION_NOT_REQUIRED"));
});
test("flags wildcard credentialed CORS and missing headers", () => {
 const result=analyzeApiSecurity({corsText:"Access-Control-Allow-Origin: *\nAccess-Control-Allow-Credentials: true",headersText:"X-Powered-By: Express"});
 const ids=result.findings.map(item=>item.id);
 assert.ok(ids.includes("CORS_WILDCARD_ORIGIN"));
 assert.ok(ids.includes("CORS_CREDENTIALS_WILDCARD"));
 assert.ok(ids.includes("HEADER_CSP_MISSING"));
 assert.ok(ids.includes("HEADER_HSTS_MISSING"));
});
test("flags disabled rate limiting and dangerous authorization defaults", () => {
 const result=analyzeApiSecurity({rateLimitText:json({enabled:false}),authzText:json({authorizationRequired:false,objectLevelChecks:false,defaultAllow:true,rolesFromClient:true})});
 const ids=result.findings.map(item=>item.id);
 assert.ok(ids.includes("RATE_LIMITING_DISABLED"));
 assert.ok(ids.includes("AUTHZ_ENFORCEMENT_DISABLED"));
 assert.ok(ids.includes("AUTHZ_OBJECT_SCOPE_GAP"));
 assert.ok(ids.includes("AUTHZ_DEFAULT_ALLOW"));
 assert.ok(ids.includes("AUTHZ_CLIENT_CONTROLLED_ROLES"));
});
test("rejects empty, malformed, non-object, and oversized inputs", () => {
 assert.throws(()=>analyzeApiSecurity({}),/at least one/);
 assert.throws(()=>analyzeApiSecurity({jwtConfigText:"{"}),/valid JSON/);
 assert.throws(()=>analyzeApiSecurity({jwtConfigText:"[]"}),/JSON object/);
 assert.throws(()=>analyzeApiSecurity({corsText:"x".repeat(300001)}),/300,000/);
});
test("builds a report with explicit static-analysis limitations", () => {
 const result=analyzeApiSecurity({headersText:"Content-Type: application/json"});
 const report=buildApiSecurityReport(result);
 assert.match(report,/API Security/);
 assert.match(report,/does not send requests/);
});
