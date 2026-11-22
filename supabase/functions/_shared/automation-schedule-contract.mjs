/** Strict authenticated API contract; no arbitrary cron strings, URLs or scripts. */
export const SCHEDULE_INTERVALS = Object.freeze([60,1440,10080]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fields = {
  list: ["action"],
  save: ["action","workflowId","scheduleId","intervalMinutes","input"],
  toggle: ["action","scheduleId","enabled"],
  delete: ["action","scheduleId"],
  output: ["action","runId"],
};
export function parseScheduleControlRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      !Object.prototype.hasOwnProperty.call(fields, body.action)) {
    return { ok: false, reason: "invalid_action" };
  }
  const keys = fields[body.action];
  if (Object.keys(body).some((key) => !keys.includes(key))) {
    return { ok: false, reason: "unknown_field" };
  }
  const action = body.action;
  if (action === "save") {
    if (typeof body.workflowId !== "string" || !UUID.test(body.workflowId) ||
        (body.scheduleId !== undefined && (typeof body.scheduleId !== "string" || !UUID.test(body.scheduleId))) ||
        !SCHEDULE_INTERVALS.includes(body.intervalMinutes) ||
        typeof body.input !== "string" || !body.input.trim() ||
        new TextEncoder().encode(body.input).length > 2000) {
      return { ok: false, reason: "invalid_schedule" };
    }
    return { ok: true, action, workflowId: body.workflowId, scheduleId: body.scheduleId ?? null,
      intervalMinutes: body.intervalMinutes, input: body.input };
  }
  if (action === "toggle" || action === "delete") {
    if (typeof body.scheduleId !== "string" || !UUID.test(body.scheduleId) ||
        (action === "toggle" && typeof body.enabled !== "boolean")) {
      return { ok: false, reason: "invalid_schedule_id" };
    }
    return { ok: true, action, scheduleId: body.scheduleId,
      ...(action === "toggle" ? { enabled: body.enabled } : {}) };
  }
  if (action === "output") {
    if (typeof body.runId !== "string" || !UUID.test(body.runId)) {
      return { ok: false, reason: "invalid_run_id" };
    }
    return { ok: true, action, runId: body.runId };
  }
  return { ok: true, action };
}
