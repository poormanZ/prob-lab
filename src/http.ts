const SECURITY_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

export const json = (data: unknown, status = 200, headers: HeadersInit = {}): Response => {
  const h = new Headers(headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) h.set(k, v);
  return Response.json(data, { status, headers: h });
};

export const redirect = (location: string, cookies: string[] = []): Response => {
  const h = new Headers(SECURITY_HEADERS);
  h.set("Location", location);
  for (const c of cookies) h.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers: h });
};

export const getCookie = (request: Request, name: string): string | null => {
  for (const part of (request.headers.get("Cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      try { return decodeURIComponent(rest.join("=")); } catch { return null; }
    }
  }
  return null;
};

export const cookie = (name: string, value: string, maxAge: number, secure: boolean): string =>
  `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;

export const randomHex = (bytes: number): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("");

export const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
};

export const readJson = async (request: Request): Promise<Record<string, unknown> | null> => {
  if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") return null;
  try {
    const body: unknown = await request.json();
    return typeof body === "object" && body !== null && !Array.isArray(body) ? body as Record<string, unknown> : null;
  } catch {
    return null;
  }
};

// SameSite=Lax still sends cookies on some cross-site requests, so writes also require a same-origin Origin header.
export const isSameOrigin = (request: Request): boolean => {
  const origin = request.headers.get("Origin");
  return origin === null || origin === new URL(request.url).origin;
};
