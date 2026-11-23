/** Parse strictly bounded, authenticated Automation control requests.
 * Webhook lifecycle actions are metadata/configuration only. No arbitrary triggers,
 * schedule expressions, external URLs, code execution or scripts.
 */
import { normalizeWorkflowSteps } from "../../../src/lib/automationWorkflow.mjs";

export const CLOUD_INPUT_LIMIT = 12000;
export const CLOUD_OUTPUT_LIMIT = 30000;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fields = {
  list: ["action"],
  templates: ["action"],
  workflowPolicy: ["action","workflowId"],
  setWorkflowPolicy: ["action","workflowId","maxInputCharacters","maxOutputCharacters","dailyRunLimit","allowWebhook","allowSchedule"],
  workflowPreflight: ["action","workflowId","channel","inputCharacters","outputCharacters"],
  installTemplate: ["action","templateId","requestKey"],
  previewWorkflow: ["action","workflowId","input","requestKey"],
  history: ["action"],
  runHistory: ["action","workflowId","channel","beforeTime","beforeId","pageSize"],
  bulkToggle: ["action","items","active","requestKey"],
  bulkUsage: ["action"],
  triggerDiagnostics: ["action","workflowId"],
  observability: ["action"],
  exportAudit: ["action","workflowId","channel","requestKey"],
  quarantineSchedule: ["action","scheduleId","expectedRevision","reason","requestKey"],
  incidentInbox: ["action","status","severity","limit"],
  incidentOpen: ["action","sourceKind","sourceId","title","severity","note","requestKey"],
  incidentTransition: ["action","incidentId","expectedRevision","nextStatus","note","requestKey"],
  incidentTimeline: ["action","incidentId"],
  recoveryReviewInbox: ["action"],
  recoveryReview: ["action","quarantineKey","decision","note","requestKey"],
  incidentCaptureEvidence: ["action","incidentId","evidenceKind","sourceId","requestKey"],
  incidentEvidence: ["action","incidentId"],
  incidentReport: ["action","days"],
  incidentRecoveryCheck: ["action","quarantineKey"],
  investigationPlanCreate: ["action","incidentId","incidentRevision","steps","requestKey"],
  investigationPlanRead: ["action","incidentId"],
  investigationStepAck: ["action","planId","expectedRevision","stepKind","note","requestKey"],
  investigationPlanTransition: ["action","planId","expectedRevision","nextStage","note","requestKey"],
  incidentDailyTrend: ["action","days"],
  incidentClosurePreflight: ["action","incidentId"],
  incidentClosureHistory: ["action","incidentId"],
  incidentClosureDecision: ["action","incidentId","incidentRevision","planRevision","decision","note","requestKey"],
  incidentReopenPreflight: ["action","incidentId"],
  incidentReopenHistory: ["action","incidentId"],
  incidentReopenDecision: ["action","incidentId","incidentRevision","planRevision","evidenceId","decision","reason","note","requestKey"],
  incidentAuditTrace: ["action","incidentId"],
  save: ["action", "workflowId", "name", "steps"],
  run: ["action", "workflowId", "input", "requestKey"],
  toggle: ["action", "workflowId", "active"],
  delete: ["action", "workflowId"],
  webhooks: ["action"],
  createWebhook: ["action", "workflowId"],
  rotateWebhook: ["action", "triggerId"],
  toggleWebhook: ["action", "triggerId", "enabled"],
  deleteWebhook: ["action", "triggerId"],
  setWebhookApproval: ["action", "triggerId", "required"],
  approvalInbox: ["action"],
  previewApproval: ["action", "approvalId"],
  approveWebhook: ["action", "approvalId"],
  rejectWebhook: ["action", "approvalId"],
  setWebhookLimits: ["action", "triggerId", "dailyExecutions", "dailySubmissions"],
  clearResolvedApprovals: ["action"],
};

export function parseAutomationControlRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      !Object.prototype.hasOwnProperty.call(fields, value.action)) {
    return { ok: false, reason: "invalid_action" };
  }
  const allowed = fields[value.action];
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    return { ok: false, reason: "unexpected_field" };
  }
  const action = value.action;
  if (["save", "run", "toggle", "delete", "createWebhook", "previewWorkflow", "workflowPolicy", "setWorkflowPolicy", "workflowPreflight", "triggerDiagnostics", "runHistory"].includes(action) &&
      value.workflowId !== undefined &&
      (typeof value.workflowId !== "string" || !UUID_RE.test(value.workflowId))) {
    return { ok: false, reason: "invalid_workflow_id" };
  }
  if (["run", "toggle", "delete", "previewWorkflow", "workflowPolicy", "setWorkflowPolicy", "workflowPreflight", "triggerDiagnostics"].includes(action) && typeof value.workflowId !== "string") {
    return { ok: false, reason: "missing_workflow_id" };
  }
  if (["createWebhook"].includes(action) && typeof value.workflowId !== "string") {
    return { ok: false, reason: "missing_workflow_id" };
  }
  if (["rotateWebhook", "toggleWebhook", "deleteWebhook", "setWebhookApproval", "setWebhookLimits"].includes(action) &&
      (typeof value.triggerId !== "string" || !UUID_RE.test(value.triggerId))) {
    return { ok: false, reason: "invalid_trigger_id" };
  }
  if (["previewApproval", "approveWebhook", "rejectWebhook"].includes(action) &&
      (typeof value.approvalId !== "string" || !UUID_RE.test(value.approvalId))) {
    return { ok: false, reason: "invalid_approval_id" };
  }
  if (action === "setWebhookLimits" &&
      (!Number.isInteger(value.dailyExecutions) || value.dailyExecutions < 1 ||
       value.dailyExecutions > 30 || !Number.isInteger(value.dailySubmissions) ||
       value.dailySubmissions < 1 || value.dailySubmissions > 40)) {
    return { ok: false, reason: "invalid_limits" };
  }
  if (action === "setWebhookApproval" && typeof value.required !== "boolean") {
    return { ok: false, reason: "invalid_required" };
  }
  if (action === "toggleWebhook" && typeof value.enabled !== "boolean") {
    return { ok: false, reason: "invalid_enabled" };
  }
  if (["webhooks", "createWebhook", "rotateWebhook", "toggleWebhook", "deleteWebhook", "setWebhookApproval",
       "approvalInbox", "previewApproval", "approveWebhook", "rejectWebhook",
       "setWebhookLimits", "clearResolvedApprovals"].includes(action)) {
    return { ok: true, action,
      ...(value.workflowId ? { workflowId: value.workflowId } : {}),
      ...(value.triggerId ? { triggerId: value.triggerId } : {}),
      ...(action === "toggleWebhook" ? { enabled: value.enabled } : {}),
      ...(action === "setWebhookApproval" ? { required: value.required } : {}),
      ...(action === "setWebhookLimits" ? {
        dailyExecutions: value.dailyExecutions,
        dailySubmissions: value.dailySubmissions,
      } : {}),
      ...(["previewApproval","approveWebhook","rejectWebhook"].includes(action)
        ? { approvalId: value.approvalId } : {}),
    };
  }
  if(["incidentReopenPreflight","incidentReopenHistory","incidentAuditTrace"].includes(action)){
    if(typeof value.incidentId!=="string"||!UUID_RE.test(value.incidentId)){
      return {ok:false,reason:"invalid_incident_id"};
    }
    return {ok:true,action,incidentId:value.incidentId};
  }
  if(action==="incidentReopenDecision"){
    if(typeof value.incidentId!=="string"||!UUID_RE.test(value.incidentId)||
       typeof value.evidenceId!=="string"||!UUID_RE.test(value.evidenceId)||
       !Number.isInteger(value.incidentRevision)||value.incidentRevision<1||
       value.incidentRevision>2147483647||
       !Number.isInteger(value.planRevision)||value.planRevision<1||
       value.planRevision>2147483647||
       !["hold","approve"].includes(value.decision)||
       !["new_evidence","recurrence","incomplete_review","other"].includes(value.reason)||
       typeof value.note!=="string"||value.note.trim().length<12||
       value.note.trim().length>500||
       typeof value.requestKey!=="string"||!UUID_RE.test(value.requestKey)){
      return {ok:false,reason:"invalid_reopen_decision"};
    }
    return {ok:true,action,incidentId:value.incidentId,evidenceId:value.evidenceId,
      incidentRevision:value.incidentRevision,planRevision:value.planRevision,
      decision:value.decision,reason:value.reason,note:value.note.trim(),
      requestKey:value.requestKey};
  }
  if(action==="incidentClosurePreflight"||action==="incidentClosureHistory"){
    if(typeof value.incidentId!=="string"||!UUID_RE.test(value.incidentId)){
      return {ok:false,reason:"invalid_incident_id"};
    }
    return {ok:true,action,incidentId:value.incidentId};
  }
  if(action==="incidentClosureDecision"){
    if(typeof value.incidentId!=="string"||!UUID_RE.test(value.incidentId)||
       !Number.isInteger(value.incidentRevision)||value.incidentRevision<1||
       value.incidentRevision>2147483647||
       !Number.isInteger(value.planRevision)||value.planRevision<1||
       value.planRevision>2147483647||
       !["defer","approve"].includes(value.decision)||
       typeof value.note!=="string"||value.note.trim().length<12||
       value.note.trim().length>500||
       typeof value.requestKey!=="string"||!UUID_RE.test(value.requestKey)){
      return {ok:false,reason:"invalid_closure_decision"};
    }
    return {ok:true,action,incidentId:value.incidentId,
      incidentRevision:value.incidentRevision,planRevision:value.planRevision,
      decision:value.decision,note:value.note.trim(),requestKey:value.requestKey};
  }
  if(action==="investigationPlanCreate"){
    if(typeof value.incidentId!=="string"||!UUID_RE.test(value.incidentId)||
       !Number.isInteger(value.incidentRevision)||value.incidentRevision<1||
       value.incidentRevision>2147483647||
       typeof value.requestKey!=="string"||!UUID_RE.test(value.requestKey)||
       !Array.isArray(value.steps)||value.steps.length<1||
       value.steps.length>6||
       value.steps.some(step=>typeof step!=="string"||
          !["review_evidence","inspect_run_history","inspect_workflow_policy",
          "verify_schedule_state","review_quarantine","document_outcome"].includes(step))||
       new Set(value.steps).size!==value.steps.length){
      return {ok:false,reason:"invalid_investigation_plan"};
    }
    return {ok:true,action,incidentId:value.incidentId,
      incidentRevision:value.incidentRevision,steps:value.steps,
      requestKey:value.requestKey};
  }
  if(action==="investigationPlanRead"){
    if(typeof value.incidentId!=="string"||!UUID_RE.test(value.incidentId)){
      return {ok:false,reason:"invalid_incident_id"};
    }
    return {ok:true,action,incidentId:value.incidentId};
  }
  if(action==="investigationStepAck"||action==="investigationPlanTransition"){
    if(typeof value.planId!=="string"||!UUID_RE.test(value.planId)||
       !Number.isInteger(value.expectedRevision)||
       value.expectedRevision<1||value.expectedRevision>2147483646||
       typeof value.note!=="string"||value.note.trim().length<12||
       value.note.trim().length>500||
       typeof value.requestKey!=="string"||!UUID_RE.test(value.requestKey)){
      return {ok:false,reason:"invalid_plan_update"};
    }
    if(action==="investigationStepAck"){
      if(!["review_evidence","inspect_run_history","inspect_workflow_policy",
         "verify_schedule_state","review_quarantine","document_outcome"].includes(value.stepKind)){
        return {ok:false,reason:"invalid_plan_step"};
      }
      return {ok:true,action,planId:value.planId,
        expectedRevision:value.expectedRevision,
        stepKind:value.stepKind,note:value.note.trim(),requestKey:value.requestKey};
    }
    if(!["reviewed","closed"].includes(value.nextStage)){
      return {ok:false,reason:"invalid_plan_stage"};
    }
    return {ok:true,action,planId:value.planId,
      expectedRevision:value.expectedRevision,
      nextStage:value.nextStage,note:value.note.trim(),requestKey:value.requestKey};
  }
  if(action==="incidentDailyTrend"){
    if(![7,30].includes(value.days)){
      return {ok:false,reason:"invalid_report_period"};
    }
    return {ok:true,action,days:value.days};
  }
  if(action==="incidentCaptureEvidence"){
    if(typeof value.incidentId!=="string"||!UUID_RE.test(value.incidentId)||
       !["incident_origin","completed_run","schedule_state","quarantine_receipt"].includes(value.evidenceKind)||
       typeof value.sourceId!=="string"||!UUID_RE.test(value.sourceId)||
       typeof value.requestKey!=="string"||!UUID_RE.test(value.requestKey)){
      return {ok:false,reason:"invalid_evidence"};
    }
    return {ok:true,action,incidentId:value.incidentId,
      evidenceKind:value.evidenceKind,sourceId:value.sourceId,
      requestKey:value.requestKey};
  }
  if(action==="incidentEvidence"){
    if(typeof value.incidentId!=="string"||!UUID_RE.test(value.incidentId)){
      return {ok:false,reason:"invalid_incident_id"};
    }
    return {ok:true,action,incidentId:value.incidentId};
  }
  if(action==="incidentReport"){
    if(![7,30].includes(value.days)){
      return {ok:false,reason:"invalid_report_period"};
    }
    return {ok:true,action,days:value.days};
  }
  if(action==="incidentRecoveryCheck"){
    if(typeof value.quarantineKey!=="string"||!UUID_RE.test(value.quarantineKey)){
      return {ok:false,reason:"invalid_quarantine_key"};
    }
    return {ok:true,action,quarantineKey:value.quarantineKey};
  }
  if(action==="incidentInbox"){
    if(value.status!==undefined &&
       !["open","investigating","resolved"].includes(value.status)||
       value.severity!==undefined &&
       !["low","medium","high"].includes(value.severity)||
       value.limit!==undefined &&
       (!Number.isInteger(value.limit)||value.limit<1||value.limit>30)){
      return {ok:false,reason:"invalid_incident_filters"};
    }
    return {ok:true,action,status:value.status??null,
      severity:value.severity??null,limit:value.limit??20};
  }
  if(action==="incidentOpen"){
    if(!["schedule_failed","schedule_expired_lease","schedule_quarantine",
         "completed_run_review"].includes(value.sourceKind)||
       typeof value.sourceId!=="string"||!UUID_RE.test(value.sourceId)||
       typeof value.title!=="string"||value.title.trim().length<8||
       value.title.trim().length>100||
       !["low","medium","high"].includes(value.severity)||
       typeof value.note!=="string"||value.note.trim().length<8||
       value.note.trim().length>500||
       typeof value.requestKey!=="string"||!UUID_RE.test(value.requestKey)){
      return {ok:false,reason:"invalid_incident"};
    }
    return {ok:true,action,sourceKind:value.sourceKind,sourceId:value.sourceId,
      title:value.title.trim(),severity:value.severity,note:value.note.trim(),
      requestKey:value.requestKey};
  }
  if(action==="incidentTransition"){
    if(typeof value.incidentId!=="string"||!UUID_RE.test(value.incidentId)||
       !Number.isInteger(value.expectedRevision)||value.expectedRevision<1||
       value.expectedRevision>2147483646||
       !["investigating","resolved"].includes(value.nextStatus)||
       typeof value.note!=="string"||value.note.trim().length<8||
       value.note.trim().length>500||
       typeof value.requestKey!=="string"||!UUID_RE.test(value.requestKey)){
      return {ok:false,reason:"invalid_incident_transition"};
    }
    return {ok:true,action,incidentId:value.incidentId,
      expectedRevision:value.expectedRevision,nextStatus:value.nextStatus,
      note:value.note.trim(),requestKey:value.requestKey};
  }
  if(action==="incidentTimeline"){
    if(typeof value.incidentId!=="string"||!UUID_RE.test(value.incidentId)){
      return {ok:false,reason:"invalid_incident_id"};
    }
    return {ok:true,action,incidentId:value.incidentId};
  }
  if(action==="recoveryReviewInbox")return {ok:true,action};
  if(action==="recoveryReview"){
    if(typeof value.quarantineKey!=="string"||!UUID_RE.test(value.quarantineKey)||
       !["keep_quarantined","reviewed_for_manual_restore"].includes(value.decision)||
       typeof value.note!=="string"||value.note.trim().length<12||
       value.note.trim().length>500||
       typeof value.requestKey!=="string"||!UUID_RE.test(value.requestKey)){
      return {ok:false,reason:"invalid_recovery_review"};
    }
    return {ok:true,action,quarantineKey:value.quarantineKey,
      decision:value.decision,note:value.note.trim(),requestKey:value.requestKey};
  }
  if(action==="observability")return {ok:true,action};
  if(action==="exportAudit"){
    if(value.workflowId!==undefined &&
      (typeof value.workflowId!=="string"||!UUID_RE.test(value.workflowId))||
       value.channel!==undefined &&
       !["manual","webhook","scheduled"].includes(value.channel)||
       typeof value.requestKey!=="string"||!UUID_RE.test(value.requestKey)){
      return {ok:false,reason:"invalid_export"};
    }
    return {ok:true,action,workflowId:value.workflowId??null,
      channel:value.channel??null,requestKey:value.requestKey};
  }
  if(action==="quarantineSchedule"){
    if(typeof value.scheduleId!=="string"||!UUID_RE.test(value.scheduleId)||
      !Number.isInteger(value.expectedRevision)||
      value.expectedRevision<1||value.expectedRevision>2147483647||
      !["stale_lease","unexpected_behavior","manual_safety_hold"].includes(value.reason)||
      typeof value.requestKey!=="string"||!UUID_RE.test(value.requestKey)){
      return {ok:false,reason:"invalid_quarantine"};
    }
    return {ok:true,action,scheduleId:value.scheduleId,
      expectedRevision:value.expectedRevision,reason:value.reason,
      requestKey:value.requestKey};
  }
  if (action==="bulkToggle") {
    if(typeof value.active!=="boolean"||
      typeof value.requestKey!=="string"||!UUID_RE.test(value.requestKey)||
      !Array.isArray(value.items)||value.items.length<1||value.items.length>5){
      return {ok:false,reason:"invalid_bulk"};
    }
    const seen=new Set();
    const items=[];
    for(const item of value.items){
      if(!item||typeof item!=="object"||Array.isArray(item)||
        Object.keys(item).length!==3||!Object.keys(item).every(k=>
          ["id","revision","active"].includes(k))||
        typeof item.id!=="string"||!UUID_RE.test(item.id)||
        !Number.isInteger(item.revision)||item.revision<1||
        item.revision>2147483647||typeof item.active!=="boolean"||
        seen.has(item.id.toLowerCase()))return {ok:false,reason:"invalid_bulk_items"};
      seen.add(item.id.toLowerCase());
      items.push({id:item.id.toLowerCase(),revision:item.revision,active:item.active});
    }
    return {ok:true,action,items,active:value.active,requestKey:value.requestKey};
  }
  if(action==="runHistory"){
    if(value.workflowId!==undefined &&
      (typeof value.workflowId!=="string"||!UUID_RE.test(value.workflowId)))return {ok:false,reason:"invalid_history"};
    if(value.channel!==undefined &&
       !["manual","webhook","scheduled"].includes(value.channel))return {ok:false,reason:"invalid_history"};
    if(value.pageSize!==undefined &&
       (!Number.isInteger(value.pageSize)||value.pageSize<1||value.pageSize>30))return {ok:false,reason:"invalid_history"};
    const hasBeforeTime=value.beforeTime!==undefined,hasBeforeId=value.beforeId!==undefined;
    if(hasBeforeTime!==hasBeforeId)return {ok:false,reason:"invalid_history_cursor"};
    if(hasBeforeTime&&
      (typeof value.beforeTime!=="string"||value.beforeTime.length>40||
       !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value.beforeTime)||
       Number.isNaN(Date.parse(value.beforeTime))||
       typeof value.beforeId!=="string"||!UUID_RE.test(value.beforeId)))return {ok:false,reason:"invalid_history_cursor"};
    return {ok:true,action,
      workflowId:value.workflowId??null,channel:value.channel??null,
      pageSize:value.pageSize??20,
      beforeTime:value.beforeTime??null,beforeId:value.beforeId??null};
  }
  if(action==="triggerDiagnostics")return {ok:true,action,workflowId:value.workflowId};
  if(action==="bulkUsage")return {ok:true,action};
  if (action === "workflowPolicy") {
    return {ok:true,action,workflowId:value.workflowId};
  }
  if (action === "setWorkflowPolicy") {
    if (!Number.isInteger(value.maxInputCharacters) ||
      value.maxInputCharacters<0||value.maxInputCharacters>12000 ||
      !Number.isInteger(value.maxOutputCharacters) ||
      value.maxOutputCharacters<0||value.maxOutputCharacters>30000 ||
      !Number.isInteger(value.dailyRunLimit) ||
      value.dailyRunLimit<1||value.dailyRunLimit>30 ||
      typeof value.allowWebhook!=="boolean" ||
      typeof value.allowSchedule!=="boolean") {
      return {ok:false,reason:"invalid_policy"};
    }
    return {ok:true,action,workflowId:value.workflowId,
      maxInputCharacters:value.maxInputCharacters,
      maxOutputCharacters:value.maxOutputCharacters,
      dailyRunLimit:value.dailyRunLimit,
      allowWebhook:value.allowWebhook,allowSchedule:value.allowSchedule};
  }
  if (action === "workflowPreflight") {
    if (!["manual","webhook","scheduled"].includes(value.channel) ||
      (value.inputCharacters !== undefined &&
        (!Number.isInteger(value.inputCharacters) || value.inputCharacters<0 ||
          value.inputCharacters>12000)) ||
      (value.outputCharacters !== undefined &&
        (!Number.isInteger(value.outputCharacters) || value.outputCharacters<0 ||
          value.outputCharacters>30000))) {
      return {ok:false,reason:"invalid_preflight"};
    }
    return {ok:true,action,workflowId:value.workflowId,channel:value.channel,
      inputCharacters:value.inputCharacters??null,
      outputCharacters:value.outputCharacters??null};
  }
  if (action === "installTemplate") {
    if (typeof value.templateId !== "string" ||
        !/^[a-z][a-z0-9-]{2,40}$/.test(value.templateId) ||
        typeof value.requestKey !== "string" || !UUID_RE.test(value.requestKey)) {
      return { ok:false, reason:"invalid_template_install" };
    }
    return { ok:true, action, templateId:value.templateId, requestKey:value.requestKey };
  }
  if (action === "previewWorkflow") {
    if (typeof value.input !== "string" ||
        new TextEncoder().encode(value.input).byteLength > 2000 ||
        typeof value.requestKey !== "string" || !UUID_RE.test(value.requestKey)) {
      return { ok:false, reason:"invalid_preview" };
    }
    return { ok:true, action, workflowId:value.workflowId,
      requestKey:value.requestKey, input:value.input };
  }
  if (action === "save") {
    if (typeof value.name !== "string" || !value.name.trim() || value.name.trim().length > 80 ||
        !Array.isArray(value.steps) || value.steps.length === 0) {
      return { ok: false, reason: "invalid_workflow" };
    }
    try {
      const steps = normalizeWorkflowSteps(value.steps);
      if (JSON.stringify(steps).length > 11000) return { ok: false, reason: "steps_too_large" };
      return { ok: true, action, name: value.name.trim(), steps, workflowId: value.workflowId ?? null };
    } catch {
      return { ok: false, reason: "invalid_steps" };
    }
  }
  if (action === "run") {
    if (typeof value.input !== "string" || value.input.length > CLOUD_INPUT_LIMIT ||
        typeof value.requestKey !== "string" || !UUID_RE.test(value.requestKey)) {
      return { ok: false, reason: "invalid_run_request" };
    }
    return { ok: true, action, input: value.input, requestKey: value.requestKey, workflowId: value.workflowId };
  }
  if (action === "toggle") {
    if (typeof value.active !== "boolean") return { ok: false, reason: "invalid_active" };
    return { ok: true, action, workflowId: value.workflowId, active: value.active };
  }
  if (action === "delete") return { ok: true, action, workflowId: value.workflowId };
  return { ok: true, action };
}
