import { extractErrorMessage } from "../services/apiClient.ts";

function assertStrictEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}. Expected "${expected}", but got "${actual}"`);
  }
}

function runSelfCheck() {
  console.log("Running self-check on API response & error parser...");

  // 1. Plain-text error response from Spring Boot (e.g. AuthController.registerUser)
  const plainTextAxiosError = {
    isAxiosError: true,
    response: {
      status: 400,
      data: "Email đã được sử dụng!",
    },
  };
  const extracted1 = extractErrorMessage(plainTextAxiosError);
  assertStrictEqual(
    extracted1,
    "Email đã được sử dụng!",
    "Must extract plain string error message"
  );

  // 2. JSON error response
  const jsonAxiosError = {
    isAxiosError: true,
    response: {
      status: 401,
      data: {
        message: "Email hoặc mật khẩu không chính xác",
      },
    },
  };
  const extracted2 = extractErrorMessage(jsonAxiosError);
  assertStrictEqual(
    extracted2,
    "Email hoặc mật khẩu không chính xác",
    "Must extract nested message from JSON error response"
  );

  // 3. Fallback generic error
  const genericError = new Error("Lỗi kết nối mạng");
  const extracted3 = extractErrorMessage(genericError);
  assertStrictEqual(extracted3, "Lỗi kết nối mạng", "Must extract Error message");

  console.log(" All self-check assertions passed successfully!");
}

runSelfCheck();
