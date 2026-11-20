export const AUTH_COOKIE_NAME = "beevo_session";

export function authCookieOptions() {
  const production = process.env.NODE_ENV === "production";
  const sameSite =
    process.env.AUTH_COOKIE_SAME_SITE || (production ? "none" : "lax");

  return {
    httpOnly: true,
    secure: production || sameSite === "none",
    sameSite,
    path: "/",
    maxAge: Number(process.env.JWT_COOKIE_MAX_AGE_MS) || 60 * 60 * 1000,
    ...(process.env.AUTH_COOKIE_DOMAIN
      ? { domain: process.env.AUTH_COOKIE_DOMAIN }
      : {}),
  };
}

export function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions());
}

export function clearAuthCookie(res) {
  const options = { ...authCookieOptions() };
  delete options.maxAge;
  res.clearCookie(AUTH_COOKIE_NAME, options);
}

export function getAuthCookie(req) {
  const header = req.headers.cookie || "";

  for (const item of header.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0) continue;

    const name = item.slice(0, separator).trim();
    if (name !== AUTH_COOKIE_NAME) continue;

    const value = item.slice(separator + 1).trim();

    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return null;
}
