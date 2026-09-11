import { ApiRequest, ApiResponse } from "@zim/core";

export async function executeOverHttp(endpoint: string, request: ApiRequest): Promise<ApiResponse> {
  const response = await fetch(new URL("/api/v1", endpoint), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  const payload = (await response.json()) as ApiResponse;
  if (!response.ok && payload.status !== "error") {
    throw new Error(`GUI backend returned HTTP ${response.status}`);
  }
  return payload;
}
