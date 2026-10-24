import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiUrl, getJson } from "./client";

afterEach(() => vi.unstubAllGlobals());

describe("apiUrl", () => {
  it("drops empty parameters", () => {
    expect(apiUrl("/api/accuracy", { basis: "decision", start: undefined, end: "", horizon_h: 0 })).toBe(
      "/api/accuracy?basis=decision&horizon_h=0",
    );
  });
});

describe("getJson", () => {
  it("surfaces the API's error detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ detail: "Decision date must be within ..." }), { status: 404 })),
    );
    await expect(getJson("/api/decisions/2025-12-31")).rejects.toEqual(
      expect.objectContaining({ status: 404, message: "Decision date must be within ..." }),
    );
    await expect(getJson("/api/decisions/2025-12-31")).rejects.toBeInstanceOf(ApiError);
  });
});
