import { describe, expect, it } from "vitest";
import worker, { type Env } from "./index";

const env = { ASSETS: { fetch: async () => new Response("asset") } } as unknown as Env;
const get = (path: string) => worker.fetch(new Request(`https://example.test${path}`), env);

describe("worker", () => {
  it("answers health checks", async () => {
    expect(await (await get("/health")).json()).toEqual({ ok: true });
  });

  it("hands everything else to static assets", async () => {
    expect(await (await get("/")).text()).toBe("asset");
  });
});
