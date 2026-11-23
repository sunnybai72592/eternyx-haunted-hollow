// Explicit error boundaries for participant-private Service request deep links.
// Do not confuse a missing row or RLS denial with database unavailability.
export type PrivateRequestReadError = { code?: string | null; message?: string | null };
export type PrivateRequestReadResult = {
  kind: 'ready' | 'inaccessible' | 'unavailable';
  message: string;
  retryable: boolean;
};

export function describePrivateRequestRead(
  error: PrivateRequestReadError | null | undefined,
  found: boolean,
): PrivateRequestReadResult {
  if (!error) {
    return found
      ? { kind: 'ready', message: '', retryable: false }
      : {
          kind: 'inaccessible',
          message: 'This request was not found or the signed-in account cannot access it.',
          retryable: false,
        };
  }

  const code = error.code ?? '';
  const message = error.message ?? '';
  if (code === '42501' || code === 'PGRST301' || /permission denied|unauthorized|forbidden/i.test(message)) {
    return {
      kind: 'inaccessible',
      message: 'The signed-in account cannot access this private request.',
      retryable: false,
    };
  }
  if (code === '42P01' || code === 'PGRST205' || code === 'PGRST200') {
    return {
      kind: 'unavailable',
      message: 'The private request database view is not available. Ask an administrator to check the Services migrations.',
      retryable: true,
    };
  }
  if (code === '57014' || /timed? ?out|timeout|abort|cancel/i.test(message)) {
    return {
      kind: 'unavailable',
      message: 'The private request lookup timed out. Retry after the connection recovers.',
      retryable: true,
    };
  }
  if (/network|fetch|connection|connect/i.test(message)) {
    return {
      kind: 'unavailable',
      message: 'The private request database connection is unavailable. Retry after connectivity is restored.',
      retryable: true,
    };
  }
  return {
    kind: 'unavailable',
    message: 'The private request lookup failed. Verify database availability before retrying.',
    retryable: true,
  };
}
