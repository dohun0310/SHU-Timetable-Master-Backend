import request from "supertest";
import { describe, expect, it } from "vitest";

import { catalogSchema } from "../../src/domain/schemas/catalog-schema.js";
import { createApp } from "../../src/server/app.js";

const catalog = catalogSchema.parse({
  meta: {
    academicYear: 2026,
    semester: "SECOND",
    generatedAt: "2026-07-12T00:00:00.000Z",
    source: "https://example.com/sap",
    courseCount: 0,
  },
  filters: { categories: [], departments: [], majors: [], professors: [], days: [] },
  courses: [],
});

describe("catalog API", () => {
  const app = createApp({ catalog, corsOrigin: "https://timetable.example.com" });

  it("serves the same catalog from API and static JSON endpoints", async () => {
    const api = await request(app).get("/api/catalog").expect(200);
    const json = await request(app).get("/catalog.json").expect(200);
    expect(api.body).toEqual(catalog);
    expect(json.body).toEqual(catalog);
    expect(api.headers["cache-control"]).toContain("max-age=300");
    expect(api.headers.etag).toBeTruthy();
  });

  it("supports conditional requests and configured CORS", async () => {
    const first = await request(app)
      .get("/api/catalog")
      .set("Origin", "https://timetable.example.com")
      .expect(200);
    expect(first.headers["access-control-allow-origin"]).toBe("https://timetable.example.com");
    const etag = first.headers.etag;
    expect(etag).toBeTypeOf("string");
    await request(app)
      .get("/api/catalog")
      .set("If-None-Match", etag ?? "")
      .expect(304);
  });

  it("reports health without caching", async () => {
    const response = await request(app).get("/api/health").expect(200);
    expect(response.body).toEqual({ status: "ok", courseCount: 0 });
    expect(response.headers["cache-control"]).toBe("no-store");
  });
});
