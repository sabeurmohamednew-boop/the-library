import "server-only";

export type RuntimeFailure = {
  scope: string;
  code: string;
  message: string;
  userMessage: string;
};

export type RuntimeResult<T> = { ok: true; data: T } | { ok: false; error: RuntimeFailure };

function errorCode(error: unknown) {
  const code = (error as { code?: unknown })?.code;
  if (typeof code === "string") return code;
  return error instanceof Error ? error.name : "UNKNOWN";
}

function sanitizeMessage(value: string) {
  return value.replace(/postgres(?:ql)?:\/\/[^@\s]+@/gi, "postgresql://***@");
}

export function isDatabaseReadinessError(error: unknown) {
  const code = errorCode(error);
  return code === "P1001" || code === "P1002" || code === "P2021" || code === "P2022" || code === "PrismaClientInitializationError";
}

export function runtimeFailure(scope: string, error: unknown): RuntimeFailure {
  const code = errorCode(error);
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = sanitizeMessage(rawMessage);
  const userMessage = isDatabaseReadinessError(error)
    ? "The Library database is not ready. Run the Neon migration, then reload."
    : "The Library could not load this data. Please try again shortly.";

  return {
    scope,
    code,
    message,
    userMessage,
  };
}

export function logRuntimeFailure(failure: RuntimeFailure, context?: Record<string, unknown>) {
  console.error("[library:runtime]", {
    scope: failure.scope,
    code: failure.code,
    message: failure.message,
    ...(context ?? {}),
  });
}

export async function safeRuntime<T>(scope: string, task: () => Promise<T>, context?: Record<string, unknown>): Promise<RuntimeResult<T>> {
  try {
    return { ok: true, data: await task() };
  } catch (error) {
    const failure = runtimeFailure(scope, error);
    logRuntimeFailure(failure, context);
    return { ok: false, error: failure };
  }
}
