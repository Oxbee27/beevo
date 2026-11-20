const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:3000")
  .replace(/\/+$/, "");

export async function apiRequest(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  let response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      credentials: "include",
    });
  } catch {
    throw new Error(
      "Unable to connect to Beevo. Please check your internet connection and try again.",
    );
  }

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.success === false) {
    const error = new Error(
      result.message || "Something went wrong. Please try again.",
    );

    error.status = response.status;
    error.errors = result.errors;

    throw error;
  }

  return result;
}
