import {
  clearSessionCookie, clearStateCookie, createSession, currentUser, deleteSession, sessionCookie, setUsername, STATE_COOKIE, stateCookie,
} from "./auth";
import { getCookie, isSameOrigin, json, randomHex, readJson, redirect } from "./http";
import { authorizeUrl, fetchKakaoUserId, getOrCreateUserId, KakaoAuthError, type KakaoEnv } from "./kakao";
import { getRanking, parseRecord, saveRecord } from "./records";

export interface Env extends KakaoEnv {
  ASSETS: Fetcher;
  DB: D1Database;
}

const log = (event: string, extra: Record<string, unknown> = {}): void => console.log(JSON.stringify({ event, ...extra }));

const completeLogin = async (request: Request, env: Env, url: URL, secure: boolean): Promise<Response> => {
  const clear = clearStateCookie(secure);
  const fail = (): Response => redirect("/?login=failed", [clear]);
  const saved = getCookie(request, STATE_COOKIE);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error") || !code || !state || !saved || state !== saved || !env.KAKAO_REST_API_KEY) return fail();
  try {
    const kakaoId = await fetchKakaoUserId(env, env.KAKAO_REST_API_KEY, url.origin, code);
    const userId = await getOrCreateUserId(env.DB, kakaoId);
    const sid = await createSession(env.DB, userId);
    return redirect("/", [clear, sessionCookie(sid, secure)]);
  } catch (error) {
    // Never log the error message: it can echo the authorization code.
    log("auth.callback_failed", error instanceof KakaoAuthError ? { stage: error.stage, status: error.upstreamStatus } : {});
    return fail();
  }
};

const api = async (request: Request, env: Env, url: URL, secure: boolean): Promise<Response | null> => {
  const { pathname } = url;
  const method = request.method;
  if (method !== "GET" && method !== "HEAD" && !isSameOrigin(request)) return json({ error: "Forbidden" }, 403);

  if (pathname === "/auth/kakao" && method === "GET") {
    if (!env.KAKAO_REST_API_KEY) return json({ error: "카카오 로그인이 아직 설정되지 않았습니다." }, 503);
    const state = randomHex(32);
    return redirect(authorizeUrl(env.KAKAO_REST_API_KEY, url.origin, state), [stateCookie(state, secure)]);
  }
  if (pathname === "/auth/kakao/callback" && method === "GET") return completeLogin(request, env, url, secure);
  if (pathname === "/auth/logout" && method === "POST") {
    await deleteSession(env.DB, request);
    return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie(secure) });
  }

  if (pathname === "/api/ranking" && method === "GET") return json(await getRanking(env.DB, await currentUser(env.DB, request)));

  const user = pathname.startsWith("/api/") ? await currentUser(env.DB, request) : null;
  if (pathname === "/api/me" && method === "GET") {
    if (!user) return json({ error: "Unauthorized" }, 401);
    const best = await env.DB.prepare("SELECT best_stage, best_amount, achieved_at FROM records WHERE user_id = ?").bind(user.id).first();
    return json({ user, best: best ?? null });
  }
  if (pathname === "/api/me/username" && method === "PUT") {
    if (!user) return json({ error: "Unauthorized" }, 401);
    const result = await setUsername(env.DB, user, (await readJson(request))?.username);
    return result.ok ? json({ username: result.username }) : json({ error: result.error }, result.status);
  }
  if (pathname === "/api/records" && method === "POST") {
    if (!user) return json({ error: "Unauthorized" }, 401);
    if (!user.username) return json({ error: "아이디를 먼저 만들어 주세요." }, 409);
    const record = parseRecord(await readJson(request));
    if (!record) return json({ error: "Invalid record" }, 400);
    return json(await saveRecord(env.DB, user.id, record));
  }
  return null;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return Response.json({ ok: true });
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) {
      try {
        return await api(request, env, url, url.protocol === "https:") ?? json({ error: "Not found" }, 404);
      } catch (error) {
        log("api.failed", { path: url.pathname, name: error instanceof Error ? error.name : "unknown" });
        return json({ error: "Service unavailable" }, 503);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
