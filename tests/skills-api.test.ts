import { afterEach, describe, expect, it } from "vitest";

import { GET, POST } from "@/app/api/skills/route";

const originalSecret = process.env.SESSION_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSecret;
});

describe("/api/skills authorization", () => {
  it("does not expose learned ids without a trusted session", async () => {
    delete process.env.SESSION_SECRET;

    const response = await GET(new Request("http://localhost/api/skills"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "unauthenticated" });
  });

  it("does not allow a learn request without a trusted session", async () => {
    delete process.env.SESSION_SECRET;

    const response = await POST(
      new Request("http://localhost/api/skills", {
        method: "POST",
        body: JSON.stringify({ skillId: "origin" }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "unauthenticated" });
  });
});
