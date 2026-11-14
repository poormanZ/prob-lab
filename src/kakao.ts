export interface KakaoEnv { KAKAO_REST_API_KEY?: string; KAKAO_CLIENT_SECRET?: string }

export class KakaoAuthError extends Error {
  constructor(readonly stage: "token" | "user", readonly upstreamStatus: number | null = null) {
    super(`Kakao authentication failed at ${stage}`);
  }
}

export const redirectUri = (origin: string): string => `${origin}/auth/kakao/callback`;

export const authorizeUrl = (restApiKey: string, origin: string, state: string): string => {
  const url = new URL("https://kauth.kakao.com/oauth/authorize");
  url.searchParams.set("client_id", restApiKey);
  url.searchParams.set("redirect_uri", redirectUri(origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return url.toString();
};

// Only the Kakao user id is needed; the access token is discarded inside this function.
export const fetchKakaoUserId = async (env: KakaoEnv, restApiKey: string, origin: string, code: string): Promise<string> => {
  const body = new URLSearchParams({ grant_type: "authorization_code", client_id: restApiKey, redirect_uri: redirectUri(origin), code });
  if (env.KAKAO_CLIENT_SECRET) body.set("client_secret", env.KAKAO_CLIENT_SECRET);
  const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body,
  });
  if (!tokenRes.ok) throw new KakaoAuthError("token", tokenRes.status);
  const token = await tokenRes.json() as { access_token?: unknown };
  if (typeof token.access_token !== "string") throw new KakaoAuthError("token");

  const userRes = await fetch("https://kapi.kakao.com/v2/user/me", { headers: { Authorization: `Bearer ${token.access_token}` } });
  if (!userRes.ok) throw new KakaoAuthError("user", userRes.status);
  const user = await userRes.json() as { id?: unknown };
  if (typeof user.id !== "number") throw new KakaoAuthError("user");
  return String(user.id);
};

export const getOrCreateUserId = async (db: D1Database, kakaoUserId: string): Promise<number> => {
  await db.prepare("INSERT OR IGNORE INTO users (kakao_user_id) VALUES (?)").bind(kakaoUserId).run();
  const row = await db.prepare("SELECT id FROM users WHERE kakao_user_id = ? LIMIT 1").bind(kakaoUserId).first<{ id: number }>();
  if (!row) throw new Error("Failed to create or load user");
  return row.id;
};
