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
