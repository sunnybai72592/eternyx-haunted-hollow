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
  installTemplate: ["action","templateId","requestKey"],
  previewWorkflow: ["action","workflowId","input","requestKey"],
  history: ["action"],
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
  if (["save", "run", "toggle", "delete", "createWebhook", "previewWorkflow"].includes(action) &&
      value.workflowId !== undefined &&
      (typeof value.workflowId !== "string" || !UUID_RE.test(value.workflowId))) {
    return { ok: false, reason: "invalid_workflow_id" };
  }
  if (["run", "toggle", "delete", "previewWorkflow"].includes(action) && typeof value.workflowId !== "string") {
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
