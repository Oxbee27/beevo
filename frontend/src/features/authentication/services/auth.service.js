import { apiRequest } from "../../../services/api/api-client.js";

export async function loginService(credentials) {
  const result = await apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  });

  return result.data.user;
}

export async function googleLoginService(credential) {
  const result = await apiRequest("/auth/google", {
    method: "POST",
    body: JSON.stringify({ credential }),
  });

  return result.data.user;
}

export async function registerService(details) {
  const result = await apiRequest("/auth/register", {
    method: "POST",
    body: JSON.stringify(details),
  });

  return result.data;
}

export async function getCurrentUserService() {
  const result = await apiRequest("/auth/me");
  return result.data.user;
}

export async function logoutService() {
  return apiRequest("/auth/logout", {
    method: "POST",
  });
}
