export function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return cleanMessage(error.message) || fallback;
  }

  if (typeof error === "string") {
    return cleanMessage(error) || fallback;
  }

  return fallback;
}

function cleanMessage(message: string) {
  return message.replace(/^Error invoking remote method '[^']+': (?:(?:Error|TimeoutError|AbortError|TypeError): )?/, "");
}

export function isCancelledError(error: unknown) {
  return error instanceof Error && error.name === "AbortError" || /(?:opération|operation).*(?:annulée|aborted)/i.test(getErrorMessage(error, ""));
}
