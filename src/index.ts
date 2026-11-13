export interface Env {
  ASSETS: Fetcher;
}

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/health") return Response.json({ ok: true });
    return env.ASSETS.fetch(request);
  },
};
