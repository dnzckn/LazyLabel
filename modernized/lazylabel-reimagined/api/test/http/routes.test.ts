/**
 * The API's behavior at the edges: statuses, correlation ids, request validation, health.
 *
 * The capability-level behavior lives in `test/acceptance/`; this file is about the envelope.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp, MAX_BODY_BYTES, type App } from "../../src/app.js";
import { MemoryBlobStore } from "../../src/adapters/memoryBlobStore.js";
import { SqliteMetadataStore } from "../../src/adapters/sqliteMetadataStore.js";
import { createLogger } from "../../src/http/log.js";
import { get, put, request } from "../helpers/request.js";

const SIZE: [number, number] = [64, 80];

describe("the API envelope", () => {
  let app: App;
  let store: MemoryBlobStore;
  let metadata: SqliteMetadataStore;

  beforeEach(() => {
    store = new MemoryBlobStore();
    metadata = new SqliteMetadataStore(":memory:");
    app = createApp({ blobStore: store, metadataStore: metadata, datasetHealthy: async () => true });
  });
  afterEach(() => metadata.close());

  it("answers 404 for an unknown route, as a typed problem rather than an empty body", async () => {
    const response = await app.handle(get("/nope"));
    expect(response.status).toBe(404);
    expect(JSON.parse(response.body)).toMatchObject({ status: 404, code: "not_found" });
  });

  it("answers 405 and names the methods that are allowed", async () => {
    const response = await app.handle(request("DELETE", "/projects/p1/images/a.png/annotations"));
    expect(response.status).toBe(405);
    expect(response.headers["Allow"]?.split(", ").sort()).toEqual(["GET", "PUT"]);
  });

  it("returns a correlation id on every response", async () => {
    const response = await app.handle(get("/health"));
    expect(response.headers["x-correlation-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("honours a client-supplied correlation id so a trace survives the hop", async () => {
    const response = await app.handle(get("/health", undefined, { "x-correlation-id": "trace-abc" }));
    expect(response.headers["x-correlation-id"]).toBe("trace-abc");
  });

  it("logs one structured JSON line per request, carrying the correlation id", async () => {
    const lines: string[] = [];
    const logged = createApp({
      blobStore: store,
      metadataStore: metadata,
      logger: createLogger((line) => lines.push(line)),
    });

    await logged.handle(get("/health", undefined, { "x-correlation-id": "trace-xyz" }));

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      level: "info",
      correlationId: "trace-xyz",
      method: "GET",
      path: "/health",
      status: 200,
    });
  });

  it("refuses a body over the cap", async () => {
    const response = await app.handle({
      method: "PUT",
      path: "/projects/p1/images/a.png/annotations",
      query: new URLSearchParams(),
      headers: {},
      body: new Uint8Array(MAX_BODY_BYTES + 1),
    });
    expect(response.status).toBe(413);
  });

  describe("health", () => {
    it("is ok when the dataset folder and the database both answer", async () => {
      const response = await app.handle(get("/health"));
      expect(response.status).toBe(200);
      expect(JSON.parse(response.body)).toMatchObject({ status: "ok", dataset: "ok", database: "ok" });
    });

    it("is degraded, not down, when only the database is unavailable", async () => {
      // The failure-mode table: annotations are files, so losing the database costs settings and
      // nothing else. Reporting that as "down" would tell a user to stop working for no reason.
      const broken = createApp({
        blobStore: store,
        metadataStore: { ...metadata, healthy: async () => false } as typeof metadata,
        datasetHealthy: async () => true,
      });
      const response = await broken.handle(get("/health"));

      expect(response.status).toBe(200);
      expect(JSON.parse(response.body)).toMatchObject({ status: "degraded", database: "unavailable" });
      expect(JSON.parse(response.body).degraded).toHaveLength(1);
    });

    it("is 503 when the dataset folder cannot be read", async () => {
      const broken = createApp({
        blobStore: store,
        metadataStore: metadata,
        datasetHealthy: async () => false,
      });
      const response = await broken.handle(get("/health"));

      expect(response.status).toBe(503);
      expect(JSON.parse(response.body)).toMatchObject({ status: "unavailable", dataset: "unreadable" });
    });
  });

  describe("request validation", () => {
    it("asks for the image size rather than guessing it", async () => {
      const response = await app.handle(get("/projects/p1/images/a.png/annotations"));
      expect(response.status).toBe(400);
      expect(JSON.parse(response.body).message).toMatch(/height and width/);
    });

    it("refuses a path that walks out of the dataset root", async () => {
      const response = await app.handle(get("/projects/p1/images/..%2F..%2Fetc%2Fpasswd/annotations", SIZE));
      expect(response.status).toBe(400);
    });

    it("refuses a save naming a format that does not exist", async () => {
      const response = await app.handle(
        put("/projects/p1/images/a.png/annotations", {
          imageSize: SIZE,
          formats: ["PARQUET"],
          segments: [],
        }),
      );
      expect(response.status).toBe(422);
    });

    it("refuses a body that is not JSON", async () => {
      const response = await app.handle(put("/projects/p1/images/a.png/annotations", "}{"));
      expect(response.status).toBe(400);
    });

    it("refuses a mask whose box does not fit its image", async () => {
      const response = await app.handle(
        put("/projects/p1/images/a.png/annotations", {
          imageSize: SIZE,
          formats: ["YOLO_DETECTION"],
          segments: [
            { type: "Loaded", classId: 1, mask: { height: 64, width: 80, box: [0, 0, 200, 200], data: "" } },
          ],
        }),
      );
      expect(response.status).toBe(422);
    });
  });

  describe("saving", () => {
    it("reports a sidecar in a format the user did not select as stale, and does not delete it", async () => {
      await store.writeAtomic("a_coco.json", new TextEncoder().encode("{}"));

      const response = await app.handle(
        put("/projects/p1/images/a.png/annotations", {
          imageSize: SIZE,
          formats: ["YOLO_DETECTION"],
          segments: [
            { type: "Loaded", classId: 1, mask: { height: 64, width: 80, box: [1, 1, 5, 5], data: filled(16) } },
          ],
        }),
      );

      expect(response.status).toBe(200);
      // Decision 15f: warn and offer removal, never delete silently.
      expect(JSON.parse(response.body).stale).toEqual(["COCO_JSON"]);
      expect(await store.read("a_coco.json")).not.toBeNull();
    });

    it("refuses a save whose expected revision has moved, and writes nothing", async () => {
      const first = await app.handle(
        put("/projects/p1/images/a.png/annotations", {
          imageSize: SIZE,
          formats: ["YOLO_DETECTION"],
          segments: [
            { type: "Loaded", classId: 1, mask: { height: 64, width: 80, box: [1, 1, 5, 5], data: filled(16) } },
          ],
        }),
      );
      const revision = JSON.parse(first.body).written["YOLO_DETECTION"] as string;
      const before = await store.read("a.txt");

      // Somebody else saves in between.
      await store.writeAtomic("a.txt", new TextEncoder().encode("0 0.5 0.5 0.1 0.1\n"));

      const response = await app.handle(
        put("/projects/p1/images/a.png/annotations", {
          imageSize: SIZE,
          formats: ["YOLO_DETECTION"],
          expectedRevisions: { YOLO_DETECTION: revision },
          segments: [
            { type: "Loaded", classId: 2, mask: { height: 64, width: 80, box: [9, 9, 13, 13], data: filled(16) } },
          ],
        }),
      );

      expect(response.status).toBe(409);
      expect(JSON.parse(response.body).code).toBe("revision_conflict");
      // The other writer's content survived; ours was not written.
      expect(new TextDecoder().decode((await store.read("a.txt"))!)).toBe("0 0.5 0.5 0.1 0.1\n");
      expect(before).not.toBeNull();
    });

    it("says so, rather than pretending, when a format renders nothing", async () => {
      const response = await app.handle(
        put("/projects/p1/images/a.png/annotations", {
          imageSize: SIZE,
          formats: ["YOLO_DETECTION"],
          segments: [],
        }),
      );

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      // Phase 4 builds the empty-save rule. Until then the response is explicit that nothing was
      // written, rather than reporting a success that leaves the old file in place.
      expect(body.written).toEqual({});
      expect(body.skippedEmpty).toEqual(["YOLO_DETECTION"]);
      expect(body.note).toMatch(/Phase 4/);
      expect(store.keys()).toEqual([]);
    });
  });

  describe("settings", () => {
    it("serves defaults before anything has been saved", async () => {
      const response = await app.handle(get("/users/me/settings"));
      expect(response.status).toBe(200);
      expect(JSON.parse(response.body).values.window_width).toBe(1600);
    });

    it("round-trips settings, keeping keys the schema does not know", async () => {
      const saved = await app.handle(
        put("/users/me/settings", {
          values: { window_width: 1234, a_key_from_a_newer_build: { nested: true } },
          hotkeys: { undo: { primary: "Ctrl+Z", secondary: null } },
        }),
      );
      expect(saved.status).toBe(200);

      const response = await app.handle(get("/users/me/settings"));
      expect(JSON.parse(response.body).values).toEqual({
        window_width: 1234,
        a_key_from_a_newer_build: { nested: true },
      });
    });

    it("refuses a settings body with no values object", async () => {
      expect((await app.handle(put("/users/me/settings", { hotkeys: {} }))).status).toBe(400);
    });
  });
});

/** Base64 for a solid n-byte mask region. */
function filled(n: number): string {
  return Buffer.from(new Uint8Array(n).fill(1)).toString("base64");
}
