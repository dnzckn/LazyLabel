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

import { mkdtemp, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

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

    it("still saves everything else when a conflict came in with an imported legacy file", async () => {
      // The import keeps a hand-edited conflict rather than locking the user out (RULE-049's edge
      // case). Refusing it on every save then refused the theme, every slider and the formats,
      // since each save sends the whole settings -- until the user found the pair on their own.
      const base = defaultSettings();
      const imported = { ...base.hotkeys, delete_segments: { primary: "M", secondary: null } };
      await metadata.putSettings("me", { schemaVersion: 1, values: base.values, hotkeys: imported });

      const response = await app.handle(
        put("/users/me/settings", { values: { ...base.values, dark_mode: false }, hotkeys: imported }),
      );

      expect(response.status).toBe(200);
      expect(jsonBody(await app.handle(get("/users/me/settings"))).values.dark_mode).toBe(false);
    });

    it("refuses a NEW conflict even while an imported one is kept", async () => {
      const base = defaultSettings();
      const imported = { ...base.hotkeys, delete_segments: { primary: "M", secondary: null } };
      await metadata.putSettings("me", { schemaVersion: 1, values: base.values, hotkeys: imported });

      const response = await app.handle(
        put("/users/me/settings", {
          values: base.values,
          hotkeys: { ...imported, pan_up: { primary: "X", secondary: null } },
        }),
      );

      expect(response.status).toBe(422);
      const problem = jsonBody(response);
      expect(problem.detail.conflicts).toHaveLength(1);
      expect(problem.detail.conflicts[0]).toMatchObject({ key: "X" });
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

describe("C13: across a restart and an upgrade", () => {
  it("keeps settings when the process restarts over the same database FILE", async () => {
    // The test above restarts the app over the same store OBJECT, so it never showed the file
    // holding anything. This closes the database and opens the file again, as a restart does.
    const dir = await mkdtemp(path.join(os.tmpdir(), "lazylabel-settings-"));
    const file = path.join(dir, "lazylabel.db");
    try {
      const first = new SqliteMetadataStore(file);
      const base = defaultSettings();
      const saved = await createApp({ blobStore: new MemoryBlobStore(), metadataStore: first }).handle(
        put("/users/me/settings", {
          values: { ...base.values, brightness: 35, auto_save: false },
          hotkeys: { ...base.hotkeys, merge_segments: { primary: "F19", secondary: null } },
        }),
      );
      expect(saved.status).toBe(200);
      await first.close();

      const second = new SqliteMetadataStore(file);
      const body = jsonBody(
        await createApp({ blobStore: new MemoryBlobStore(), metadataStore: second }).handle(get("/users/me/settings")),
      );
      await second.close();

      expect(body.values.brightness).toBe(35);
      expect(body.values.auto_save).toBe(false);
      expect(body.hotkeys.merge_segments).toEqual({ primary: "F19", secondary: null });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  describe("a document stored before a setting or an action existed", () => {
    let metadata: SqliteMetadataStore;
    let app: App;

    beforeEach(() => {
      metadata = new SqliteMetadataStore(":memory:");
      app = createApp({ blobStore: new MemoryBlobStore(), metadataStore: metadata });
    });
    afterEach(() => metadata.close());

    type Binding = { primary: string; secondary: string | null };

    /** What an older build stored: no Min Conf, no model choice, no Find Archetypes, and more. */
    async function storeAnOlderDocument(options: { bind?: Record<string, Binding>; without?: string[] } = {}) {
      const base = defaultSettings();
      const values: Record<string, unknown> = { ...base.values, brightness: 20, from_a_newer_version: 1 };
      delete values["propagation_confidence_threshold"];
      delete values["ai_model"];
      const bindings: Record<string, Binding> = { ...base.hotkeys, ...options.bind };
      for (const action of ["find_archetypes", ...(options.without ?? [])]) delete bindings[action];
      await metadata.putSettings("me", { schemaVersion: 1, values, hotkeys: bindings });
    }

    it("is served with their defaults filled in, as legacy's loader fills them (settings.py:96, hotkeys.py:28-29)", async () => {
      await storeAnOlderDocument();

      const body = jsonBody(await app.handle(get("/users/me/settings")));

      expect(body.values.propagation_confidence_threshold).toBe(0.99);
      expect(body.values.ai_model).toBe("");
      // An action added since has its default key, rather than none at all.
      expect(body.hotkeys.find_archetypes).toEqual({ primary: "Ctrl+H", secondary: null });
      // And nothing the user stored is touched, a key this build does not know included.
      expect(body.values.brightness).toBe(20);
      expect(body.values.from_a_newer_version).toBe(1);
    });

    it("can still be saved when a default added since takes a key the user had bound", async () => {
      // The user bound H to Fit View before Next Archetype Frame shipped with H as its default.
      // The browser sends back what GET served, the pair included; refusing that would refuse every
      // save after the upgrade until the user found the pair and rebound one of them.
      await storeAnOlderDocument({
        bind: { fit_view: { primary: "H", secondary: null } },
        without: ["next_suggested_frame"],
      });

      const served = jsonBody(await app.handle(get("/users/me/settings")));
      expect(served.hotkeys.next_suggested_frame.primary).toBe("H");
      const response = await app.handle(
        put("/users/me/settings", { values: { ...served.values, dark_mode: false }, hotkeys: served.hotkeys }),
      );

      expect(response.status).toBe(200);
      expect(jsonBody(response).values.dark_mode).toBe(false);
    });
  });
});
