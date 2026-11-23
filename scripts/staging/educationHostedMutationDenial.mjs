/**
 * Authorization probes must reject SQL syntax/constraint/network errors as
 * proof of a permission boundary. Row-invisible updates also require a
 * subsequent owner-side unchanged-record assertion by the hosted runner.
 */
export function isExplicitAuthorizationDenial(result) {
  const code=String(result?.error?.code || "");
  const message=String(result?.error?.message || "");
  return Boolean(result?.error && (
    code==="42501" ||
    /permission denied|row.level security|not authorized|access denied/i.test(message)
  ));
}
export function isDeniedOrNoVisibleRow(result) {
  return isExplicitAuthorizationDenial(result) ||
    Boolean(result && !result.error &&
      Array.isArray(result.data) && result.data.length===0);
}
