export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function requestJson<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { accept: "application/json" },
    signal,
  });

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new ApiError("The server returned an invalid response", response.status);
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "The request could not be completed";

    throw new ApiError(message, response.status);
  }

  return payload as T;
}
