/** Browser guidance only. Deadline and ownership must also be enforced server-side. */
export function examDeadline(startTime, durationMinutes) {
  const start = typeof startTime === "string" ? Date.parse(startTime) : NaN;
  if (!Number.isFinite(start) || !Number.isInteger(durationMinutes) ||
      durationMinutes < 1 || durationMinutes > 1440) return null;
  return start + durationMinutes * 60_000;
}

export function examSecondsRemaining(deadline, now = Date.now()) {
  if (!Number.isFinite(deadline) || !Number.isFinite(now)) return null;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function examClock(seconds) {
  if (!Number.isInteger(seconds) || seconds < 0) return "--:--";
  return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
}

export function validExamId(value) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function answeredExamCount(answers) {
  return [...answers.values()].filter(answer =>
    Boolean(answer?.selectedOptionId) || Boolean(answer?.shortAnswer?.trim())
  ).length;
}
