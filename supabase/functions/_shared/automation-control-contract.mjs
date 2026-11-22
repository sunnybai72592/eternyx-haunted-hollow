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
  if (["save", "run", "toggle", "delete", "createWebhook"].includes(action) &&
      value.workflowId !== undefined &&
      (typeof value.workflowId !== "string" || !UUID_RE.test(value.workflowId))) {
    return { ok: false, reason: "invalid_workflow_id" };
  }
  if (["run", "toggle", "delete"].includes(action) && typeof value.workflowId !== "string") {
    return { ok: false, reason: "missing_workflow_id" };
  }
  if (["createWebhook"].includes(action) && typeof value.workflowId !== "string") {
    return { ok: false, reason: "missing_workflow_id" };
  }
  if (["rotateWebhook", "toggleWebhook", "deleteWebhook"].includes(action) &&
      (typeof value.triggerId !== "string" || !UUID_RE.test(value.triggerId))) {
    return { ok: false, reason: "invalid_trigger_id" };
  }
  if (action === "toggleWebhook" && typeof value.enabled !== "boolean") {
    return { ok: false, reason: "invalid_enabled" };
  }
  if (["webhooks", "createWebhook", "rotateWebhook", "toggleWebhook", "deleteWebhook"].includes(action)) {
    return { ok: true, action,
      ...(value.workflowId ? { workflowId: value.workflowId } : {}),
      ...(value.triggerId ? { triggerId: value.triggerId } : {}),
      ...(action === "toggleWebhook" ? { enabled: value.enabled } : {}),
    };
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
