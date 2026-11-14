import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LAST_STAGE } from "./duel";
import { MAX_STAGE } from "./game";
import worker, { type Env } from "./index";
import { maxAmountAt } from "./records";
import { createTestDb } from "./test-d1";

const ORIGIN = "https://lab.test";
let env: Env;
beforeEach(() => {
  env = { ASSETS: { fetch: async () => new Response("asset") }, DB: createTestDb(), KAKAO_REST_API_KEY: "rest-key" } as unknown as Env;
});
afterEach(() => vi.unstubAllGlobals());

const call = (path: string, init: RequestInit & { sid?: string } = {}) => {
  const headers = new Headers(init.headers);
  if (init.sid) headers.set("Cookie", `ptl_session=${init.sid}`);
  if (init.body) {
    headers.set("Content-Type", "application/json");
    if (!headers.has("Origin")) headers.set("Origin", ORIGIN);
  }
  return worker.fetch(new Request(`${ORIGIN}${path}`, { ...init, headers }), env);
};
const send = (path: string, method: string, body: unknown, sid?: string) => call(path, { method, body: JSON.stringify(body), sid });
const cookieValue = (res: Response, name: string): string | undefined =>
  res.headers.getSetCookie().map((c) => c.split(";")[0].split("=")).find(([k]) => k === name)?.[1];

let nextKakaoId = 1000;
const login = async (): Promise<string> => {
  const kakaoId = nextKakaoId++;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => String(input).includes("/oauth/token")
    ? Response.json({ access_token: "tok" })
    : Response.json({ id: kakaoId })));
  const start = await call("/auth/kakao");
  const state = cookieValue(start, "ptl_oauth_state")!;
  const back = await call(`/auth/kakao/callback?code=c&state=${state}`, { headers: { Cookie: `ptl_oauth_state=${state}` } });
  expect(back.headers.get("Location")).toBe("/");
  return decodeURIComponent(cookieValue(back, "ptl_session")!);
};
const signUp = async (username: string): Promise<string> => {
  const sid = await login();
  expect((await send("/api/me/username", "PUT", { username }, sid)).status).toBe(200);
  return sid;
};

describe("worker", () => {
  it("answers health checks and serves assets", async () => {
    expect(await (await call("/health")).json()).toEqual({ ok: true });
    expect(await (await call("/")).text()).toBe("asset");
  });
});

describe("kakao login", () => {
  it("redirects to Kakao with a state cookie and a callback on this origin", async () => {
    const res = await call("/auth/kakao");
    const url = new URL(res.headers.get("Location")!);
    expect(url.host).toBe("kauth.kakao.com");
    expect(url.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/auth/kakao/callback`);
    expect(url.searchParams.get("state")).toBe(cookieValue(res, "ptl_oauth_state"));
  });

  it("rejects a callback whose state does not match the cookie", async () => {
    const res = await call("/auth/kakao/callback?code=c&state=evil", { headers: { Cookie: "ptl_oauth_state=good" } });
    expect(res.headers.get("Location")).toBe("/?login=failed");
    expect(cookieValue(res, "ptl_session")).toBeUndefined();
  });

  it("creates a user without a username, then lets them pick one", async () => {
    const sid = await login();
    expect(await (await call("/api/me", { sid })).json()).toMatchObject({ user: { username: null }, best: null });
    expect((await send("/api/me/username", "PUT", { username: "확률왕_1" }, sid)).status).toBe(200);
    expect(await (await call("/api/me", { sid })).json()).toMatchObject({ user: { username: "확률왕_1" } });
  });

  it("keeps usernames unique and well-formed", async () => {
    await signUp("lucky");
    const sid = await login();
    expect((await send("/api/me/username", "PUT", { username: "lucky" }, sid)).status).toBe(409);
    expect((await send("/api/me/username", "PUT", { username: "a" }, sid)).status).toBe(400);
    expect((await send("/api/me/username", "PUT", { username: "<script>" }, sid)).status).toBe(400);
  });

  it("logs out by deleting the session", async () => {
    const sid = await login();
    await call("/auth/logout", { method: "POST", sid, headers: { Origin: ORIGIN } });
    expect((await call("/api/me", { sid })).status).toBe(401);
  });

  it("refuses cross-origin writes", async () => {
    const sid = await signUp("origin");
    const res = await call("/api/records", { method: "POST", sid, body: JSON.stringify({ stage: 3, amount: 400 }), headers: { Origin: "https://evil.test", "Content-Type": "application/json" } });
    expect(res.status).toBe(403);
  });
});

describe("records and ranking", () => {
  it("requires login and a username before saving", async () => {
    expect((await send("/api/records", "POST", { stage: 3, amount: 400 })).status).toBe(401);
    expect((await send("/api/records", "POST", { stage: 3, amount: 400 }, await login())).status).toBe(409);
  });

  it("keeps only the best stage, then the larger amount at that stage", async () => {
    const sid = await signUp("climber");
    const save = async (stage: number, amount: number) => (await send("/api/records", "POST", { stage, amount }, sid)).json();
    expect(await save(5, 1600)).toMatchObject({ updated: true, best: { best_stage: 5, best_amount: 1600 } });
    expect(await save(4, 3000)).toMatchObject({ updated: false, best: { best_stage: 5 } });
    expect(await save(5, 1500)).toMatchObject({ updated: false, best: { best_amount: 1600 } });
    expect(await save(5, 2000)).toMatchObject({ updated: true, best: { best_stage: 5, best_amount: 2000 } });
  });

  it("accepts a jackpot cash-out at the cap", async () => {
    const sid = await signUp("jackpot");
    expect((await send("/api/records", "POST", { stage: 3, amount: maxAmountAt(3) }, sid)).status).toBe(200);
  });

  it("rejects impossible records", async () => {
    const sid = await signUp("cheater");
    for (const body of [{ stage: 0, amount: 1 }, { stage: MAX_STAGE + 1, amount: 1 }, { stage: 2.5, amount: 1 }, { stage: 3, amount: maxAmountAt(3) + 1 }, { stage: 3 }]) {
      expect((await send("/api/records", "POST", body, sid)).status).toBe(400);
    }
  });

  it("ranks by stage, then amount, and marks the viewer", async () => {
    const a = await signUp("alpha"), b = await signUp("bravo"), c = await signUp("charlie");
    await send("/api/records", "POST", { stage: 6, amount: 3200 }, a);
    await send("/api/records", "POST", { stage: 8, amount: 12800 }, b);
    await send("/api/records", "POST", { stage: 6, amount: 5000 }, c);
    await login(); // no username → not ranked
    const data = await (await call("/api/ranking", { sid: a })).json() as { total: number; ranking: { username: string; rank: number; me: boolean }[]; me: { rank: number } };
    expect(data.total).toBe(3);
    expect(data.ranking.map((r) => [r.rank, r.username])).toEqual([[1, "bravo"], [2, "charlie"], [3, "alpha"]]);
    expect(data.ranking.find((r) => r.me)?.username).toBe("alpha");
    expect(data.me.rank).toBe(3);
    expect(JSON.stringify(data)).not.toMatch(/kakao|user_id/);
  });
});

describe("duel records and ranking", () => {
  const duel = (sid: string | undefined, cleared: number, turns: number) => send("/api/duel/records", "POST", { cleared, turns }, sid);

  it("requires login and a username", async () => {
    expect((await duel(undefined, 3, 10)).status).toBe(401);
    expect((await duel(await login(), 3, 10)).status).toBe(409);
  });

  it("keeps more stages cleared, then fewer turns", async () => {
    const sid = await signUp("duelist");
    const save = async (c: number, t: number) => (await duel(sid, c, t)).json();
    expect(await save(5, 30)).toMatchObject({ updated: true, best: { best_cleared: 5, best_turns: 30 } });
    expect(await save(4, 5)).toMatchObject({ updated: false, best: { best_cleared: 5 } });
    expect(await save(5, 31)).toMatchObject({ updated: false, best: { best_turns: 30 } });
    expect(await save(5, 22)).toMatchObject({ updated: true, best: { best_turns: 22 } });
    expect(await save(6, 90)).toMatchObject({ updated: true, best: { best_cleared: 6, best_turns: 90 } });
    expect(await (await call("/api/me", { sid })).json()).toMatchObject({ duelBest: { best_cleared: 6, best_turns: 90 } });
  });

  it("rejects impossible runs", async () => {
    const sid = await signUp("duelcheat");
    for (const [c, t] of [[0, 5], [LAST_STAGE + 2, 50], [5, 4], [2.5, 9], [5, 1.5]]) expect((await duel(sid, c, t)).status).toBe(400);
  });

  it("ranks by stages cleared, then fewer turns, and marks the viewer", async () => {
    const a = await signUp("d_alpha"), b = await signUp("d_bravo"), c = await signUp("d_charlie");
    await duel(a, 8, 40);
    await duel(b, 8, 25);
    await duel(c, 9, 99);
    const data = await (await call("/api/duel/ranking", { sid: a })).json() as { total: number; ranking: { username: string; rank: number; me: boolean }[]; me: { rank: number } };
    expect(data.ranking.map((r) => [r.rank, r.username])).toEqual([[1, "d_charlie"], [2, "d_bravo"], [3, "d_alpha"]]);
    expect(data.me.rank).toBe(3);
    expect(JSON.stringify(data)).not.toMatch(/kakao|user_id/);
  });

  it("keeps the two rankings separate", async () => {
    const sid = await signUp("solo");
    await duel(sid, 3, 9);
    expect((await (await call("/api/ranking")).json() as { total: number }).total).toBe(0);
    expect((await (await call("/api/duel/ranking")).json() as { total: number }).total).toBe(1);
  });
});
