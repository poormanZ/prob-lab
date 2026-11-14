import { cookie, getCookie, randomHex, sha256Hex } from "./http";

export interface User { id: number; username: string | null }

export const SESSION_COOKIE = "ptl_session";
export const STATE_COOKIE = "ptl_oauth_state";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
export const STATE_TTL_SECONDS = 600;

export const sessionCookie = (id: string, secure: boolean): string => cookie(SESSION_COOKIE, id, SESSION_TTL_SECONDS, secure);
export const clearSessionCookie = (secure: boolean): string => cookie(SESSION_COOKIE, "", 0, secure);
export const stateCookie = (state: string, secure: boolean): string => cookie(STATE_COOKIE, state, STATE_TTL_SECONDS, secure);
export const clearStateCookie = (secure: boolean): string => cookie(STATE_COOKIE, "", 0, secure);

export const createSession = async (db: D1Database, userId: number): Promise<string> => {
  const id = randomHex(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").bind(await sha256Hex(id), userId, expiresAt).run();
  return id;
};

export const deleteSession = async (db: D1Database, request: Request): Promise<void> => {
  const id = getCookie(request, SESSION_COOKIE);
  if (id) await db.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256Hex(id)).run();
};

export const currentUser = async (db: D1Database, request: Request): Promise<User | null> => {
  const id = getCookie(request, SESSION_COOKIE);
  if (!id) return null;
  const hash = await sha256Hex(id);
  const row = await db.prepare(
    "SELECT u.id, u.username, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? LIMIT 1",
  ).bind(hash).first<User & { expires_at: string }>();
  if (!row) return null;
  if (Date.parse(row.expires_at) <= Date.now()) {
    await db.prepare("DELETE FROM sessions WHERE id = ?").bind(hash).run();
    return null;
  }
  return { id: row.id, username: row.username };
};

// Letters (any script), digits and underscore; length counted in code points so Korean names are not penalized.
const USERNAME_PATTERN = /^[\p{L}\p{N}_]+$/u;
export const USERNAME_MIN = 2;
export const USERNAME_MAX = 12;
export const isValidUsername = (v: string): boolean => {
  const len = [...v].length;
  return len >= USERNAME_MIN && len <= USERNAME_MAX && USERNAME_PATTERN.test(v);
};

export type UsernameResult = { ok: true; username: string } | { ok: false; status: 400 | 409; error: string };

export const setUsername = async (db: D1Database, user: User, raw: unknown): Promise<UsernameResult> => {
  const username = typeof raw === "string" ? raw.trim().normalize("NFC") : "";
  if (!isValidUsername(username)) {
    return { ok: false, status: 400, error: `아이디는 ${USERNAME_MIN}~${USERNAME_MAX}자 한글·영문·숫자·_ 만 쓸 수 있습니다.` };
  }
  try {
    await db.prepare("UPDATE users SET username = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(username, user.id).run();
    return { ok: true, username };
  } catch (error) {
    if (error instanceof Error && /unique|constraint/i.test(error.message)) return { ok: false, status: 409, error: "이미 쓰고 있는 아이디입니다." };
    throw error;
  }
};
