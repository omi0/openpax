export interface AuthSearch {
  /** Same-origin path to continue to after login/signup (invitation links use it). */
  redirect?: string;
  email?: string;
}

export const authSearch = (search: Record<string, unknown>): AuthSearch => ({
  ...(typeof search.redirect === "string" && search.redirect.startsWith("/")
    ? { redirect: search.redirect }
    : {}),
  ...(typeof search.email === "string" && search.email ? { email: search.email } : {}),
});

/**
 * When an assistant sent the browser to the login page, Better Auth answers
 * the sign-in with the next step of the authorization (the consent page or
 * the assistant's callback) instead of the usual session payload. The auth
 * client follows such `redirect` answers on its own; the caller only has to
 * stop its own navigation.
 */
export function continueOAuth(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const { redirect, url } = data as { redirect?: unknown; url?: unknown };
  return redirect === true && typeof url === "string" && url.length > 0;
}
