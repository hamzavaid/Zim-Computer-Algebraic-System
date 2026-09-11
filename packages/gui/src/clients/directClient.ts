import { ApiRequest, ApiResponse, execute } from "@zim/core";

export function executeDirect(request: ApiRequest): ApiResponse {
  return execute(request);
}
