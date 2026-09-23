/**
 * C13 — Keep settings and hotkeys across sessions: the API's share.
 *
 * The schema itself, and importing a legacy `settings.json` and `hotkeys.json`, live in
 * `@lazylabel/settings-schema` and are tested there against fixtures the legacy code generated.
 * What belongs here is what the API adds: persistence across a restart, and refusing a save that
 * would store something the app could not act on.
 *
 * Two rules are enforced on the way in:
 *   RULE-049  a key bound to more than one action is refused
 *   RULE-088  the export format list can never be empty, and unknown names are dropped
 *
 * Both are checked in the browser too, by the same functions from the same package. That is not
 * redundancy: the dialog has to refuse a conflicting key while the user is typing, and the API has
 * to refuse it again because a client is not a permission.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { defaultSettings, DEFAULT_EXPORT_FORMATS } from "@lazylabel/settings-schema";
import { createApp, type App } from "../../src/app.js";
import { MemoryBlobStore } from "../../src/adapters/memoryBlobStore.js";
import { SqliteMetadataStore } from "../../src/adapters/sqliteMetadataStore.js";
import { get, put, jsonBody } from "../helpers/request.js";

describe("C13: keeping settings and hotkeys across sessions", () => {
  let app: App;
  let metadata: SqliteMetadataStore;

  beforeEach(() => {
    metadata = new SqliteMetadataStore(":memory:");
    app = createApp({ blobStore: new MemoryBlobStore(), metadataStore: metadata });
  });
  afterEach(() => metadata.close());

  it("serves the schema defaults before anything has been saved", async () => {
    const response = await app.handle(get("/users/me/settings"));
    expect(response.status).toBe(200);

    const body = jsonBody(response);
    expect(body.schemaVersion).toBe(1);
    expect(body.values).toEqual(defaultSettings().values);
    expect(body.hotkeys["undo"]).toEqual({ primary: "Ctrl+Z", secondary: null });
  });

  it("keeps settings across a restart of the service", async () => {
    const base = defaultSettings();
    await app.handle(
      put("/users/me/settings", {
        values: { ...base.values, window_width: 1234, dark_mode: false },
        hotkeys: base.hotkeys,
      }),
    );

    // A new app over the SAME database: the process restarted, the file did not go anywhere.
    const restarted = createApp({ blobStore: new MemoryBlobStore(), metadataStore: metadata });
    const body = jsonBody((await restarted.handle(get("/users/me/settings"))));

    expect(body.values.window_width).toBe(1234);
    expect(body.values.dark_mode).toBe(false);
  });

  it("stores a key the schema does not recognize, rather than discarding it (RULE-088)", async () => {
    const base = defaultSettings();
    await app.handle(
      put("/users/me/settings", {
        values: { ...base.values, a_key_from_a_newer_build: { nested: [1, 2] } },
        hotkeys: base.hotkeys,
      }),
    );

    const body = jsonBody((await app.handle(get("/users/me/settings"))));
    // Legacy would have replaced all 37 preferences with defaults on the next load.
    expect(body.values.a_key_from_a_newer_build).toEqual({ nested: [1, 2] });
    expect(body.values.window_width).toBe(1600);
  });

  describe("RULE-088: the export format list", () => {
    it("corrects an empty list to the defaults, and says it did", async () => {
      const base = defaultSettings();
      const response = await app.handle(
        put("/users/me/settings", { values: { ...base.values, export_formats: [] }, hotkeys: base.hotkeys }),
      );

      expect(response.status).toBe(200);
      const body = jsonBody(response);
      // An empty list means a save writes nothing at all while reporting success.
      expect(body.values.export_formats).toEqual([...DEFAULT_EXPORT_FORMATS]);
      expect(body.corrections).toHaveLength(1);
    });

    it("drops a format name it does not recognize", async () => {
      const base = defaultSettings();
      const response = await app.handle(
        put("/users/me/settings", {
          values: { ...base.values, export_formats: ["NPZ", "PARQUET"] },
          hotkeys: base.hotkeys,
        }),
      );

      const body = jsonBody(response);
      expect(body.values.export_formats).toEqual(["NPZ"]);
      expect(body.corrections[0]).toMatch(/PARQUET/);
    });

    it("stores a valid list untouched and reports no corrections", async () => {
      const base = defaultSettings();
      const response = await app.handle(
        put("/users/me/settings", {
          values: { ...base.values, export_formats: ["COCO_JSON", "PASCAL_VOC"] },
          hotkeys: base.hotkeys,
        }),
      );

      const body = jsonBody(response);
      expect(body.values.export_formats).toEqual(["COCO_JSON", "PASCAL_VOC"]);
      expect(body.corrections).toBeUndefined();
    });
  });

  describe("SEC-16: a value the app could not act on is refused, not stored", () => {
    // Legacy validated neither file, and one malformed hotkey crashed it on every launch. The
    // browser reads what is stored here on every launch too.

    it("refuses a known key with the wrong type, and says which", async () => {
      const base = defaultSettings();
      const response = await app.handle(
        put("/users/me/settings", { values: { ...base.values, gamma: "abc" }, hotkeys: base.hotkeys }),
      );

      expect(response.status).toBe(422);
      expect(jsonBody(response).detail.problems).toEqual(["gamma must be a number, not a string"]);
    });

    it("refuses a null binding with a 422, where it used to reach findConflicts and answer 500", async () => {
      const base = defaultSettings();
      const response = await app.handle(
        put("/users/me/settings", { values: base.values, hotkeys: { ...base.hotkeys, undo: null } }),
      );

      expect(response.status).toBe(422);
      expect(jsonBody(response).detail.problems).toEqual([
        "the binding for undo must be an object, not null",
      ]);
    });

    it("stores nothing when it refuses", async () => {
      const base = defaultSettings();
      await app.handle(
        put("/users/me/settings", { values: { ...base.values, window_width: 999 }, hotkeys: base.hotkeys }),
      );
      await app.handle(
        put("/users/me/settings", {
          values: { ...base.values, window_width: 1111 },
          hotkeys: { ...base.hotkeys, undo: { primary: 5, secondary: null } },
        }),
      );

      const body = jsonBody((await app.handle(get("/users/me/settings"))));
      expect(body.values.window_width).toBe(999);
    });

    it("still stores a key it does not know, which is RULE-088's fix and not a shape problem", async () => {
      const base = defaultSettings();
      const response = await app.handle(
        put("/users/me/settings", {
          values: { ...base.values, from_a_newer_version: [1, 2, 3] },
          hotkeys: base.hotkeys,
        }),
      );

      expect(response.status).toBe(200);
      expect(jsonBody(response).values.from_a_newer_version).toEqual([1, 2, 3]);
    });
  });

  describe("RULE-049: hotkey conflicts", () => {
    it("refuses a save binding one key to two actions, and names both", async () => {
      const base = defaultSettings();
      const response = await app.handle(
        put("/users/me/settings", {
          values: base.values,
          hotkeys: { ...base.hotkeys, delete_segments: { primary: "M", secondary: null } },
        }),
      );

      expect(response.status).toBe(422);
      const problem = jsonBody(response);
      expect(problem.detail.conflicts[0]).toMatchObject({ key: "M", heldBy: "delete_segments" });
    });

    it("writes nothing when it refuses", async () => {
      const base = defaultSettings();
      await app.handle(
        put("/users/me/settings", { values: { ...base.values, window_width: 999 }, hotkeys: base.hotkeys }),
      );
      await app.handle(
        put("/users/me/settings", {
          values: { ...base.values, window_width: 1111 },
          hotkeys: { ...base.hotkeys, pan_up: { primary: "M", secondary: null } },
        }),
      );

      // The refused save must not have taken the settings half with it.
      const body = jsonBody((await app.handle(get("/users/me/settings"))));
      expect(body.values.window_width).toBe(999);
    });

    it("accepts a rebinding to a key nobody holds", async () => {
      const base = defaultSettings();
      const response = await app.handle(
        put("/users/me/settings", {
          values: base.values,
          hotkeys: { ...base.hotkeys, merge_segments: { primary: "F19", secondary: null } },
        }),
      );

      expect(response.status).toBe(200);
      expect(jsonBody(response).hotkeys.merge_segments.primary).toBe("F19");
    });
  });
});
