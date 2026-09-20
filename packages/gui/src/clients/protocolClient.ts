import { ApiRequest, ApiResponse } from "@zim/core";

export interface ProtocolRequestOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export async function executeOverHttp(
  endpoint: string,
  request: ApiRequest,
  options: ProtocolRequestOptions = {},
): Promise<ApiResponse> {
  const controller = new AbortController();
  const abort = (): void => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener("abort", abort, { once: true });
  const timeout =
    options.timeoutMs === undefined
      ? undefined
      : setTimeout(
          () => controller.abort(new DOMException("Request timed out", "TimeoutError")),
          options.timeoutMs,
        );
  try {
    const response = await fetch(new URL("/api/v1", endpoint), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    const payload = (await response.json()) as ApiResponse;
    if (!response.ok && payload.status !== "error") {
      throw new Error(`GUI backend returned HTTP ${response.status}`);
    }
    return payload;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}
