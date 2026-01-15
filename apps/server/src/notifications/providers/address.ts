/** Split "Name <user@example.com>" (or a bare address) into its parts. */
export function parseAddress(value: string): { email: string; name?: string } {
  const m = value.trim().match(/^(.*?)\s*<([^>]+)>$/);
  if (!m) return { email: value.trim() };
  const name = (m[1] ?? "").trim().replace(/^"|"$/g, "");
  return { email: (m[2] ?? "").trim(), ...(name ? { name } : {}) };
}

export async function errorText(res: Response): Promise<string> {
  return (await res.text()).slice(0, 300);
}
