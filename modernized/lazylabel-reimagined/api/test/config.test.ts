/**
 * Configuration, and what it refuses at startup.
 *
 * The point of validating here rather than on first use is that a misconfigured service should
 * fail where an operator is looking. A dataset root that does not exist, a port that is not a
 * port, an inference URL with a typo in it — each of those was otherwise discoverable only by a
 * user clicking something and getting an error three layers down, which reads as "the app is
 * broken" rather than "this variable is wrong".
 */

import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ConfigError, loadConfig } from "../src/config.js";

const MINIMUM = { LAZYLABEL_DATASET_ROOT: "/data/images" };

const load = (env: Record<string, string | undefined>) =>
  loadConfig({ ...MINIMUM, ...env } as NodeJS.ProcessEnv);

describe("the dataset root", () => {
  it("is required, and the message says what it is for", () => {
    // The API will not guess. A running service pointed at the wrong folder answers every listing
    // with "empty", which reads as "you have no images".
    expect(() => loadConfig({} as NodeJS.ProcessEnv)).toThrow(ConfigError);
    expect(() => loadConfig({} as NodeJS.ProcessEnv)).toThrow(/folder holding your images/);
  });

  it("is resolved to an absolute path", () => {
    expect(load({}).datasetRoot).toMatch(/images$/);
  });
});

describe("the port", () => {
  it("defaults to 8787", () => {
    expect(load({}).port).toBe(8787);
  });

  it("refuses something that is not a port, quoting it", () => {
    expect(() => load({ LAZYLABEL_PORT: "eight" })).toThrow(/"eight"/);
  });
});

describe("the database", () => {
  it("is per user by default, in the desktop app's config folder", () => {
    /*
     * Until 2026-09-26 it lived inside the dataset folder, `<dataset>/.lazylabel/lazylabel.db`, and
     * this test said why: "Beside the images rather than in a system directory: decision 5 makes
     * the folder the source of truth, and a database somewhere else is a second thing to back up
     * and to lose."
     *
     * DEPLOYABILITY.md's F7 is what that default cost. Settings did not follow the user to another
     * folder. Three files (the database, -wal and -shm) went into every dataset, and a dataset may
     * be read-only, a network share, where SQLite's WAL does not work, or a synced folder. And the
     * store holds no dataset's data at all, only one settings document per user, so there was
     * nothing to keep beside the images. Decision 5's source of truth, the annotation files, is
     * still beside them.
     *
     * Per user matches both of the others: the owner's own instance already ran with exactly this
     * path, and the desktop app keeps its settings per user in the same folder, which the API
     * already reads for the one-time desktop import. A folder's old database is brought across once
     * (`settings/folderDatabaseImport.ts`).
     */
    expect(load({}).databasePath).toBe(path.join(os.homedir(), ".config", "lazylabel", "lazylabel-web.db"));
  });

  it("does not depend on the folder, so settings follow the user from one folder to another", () => {
    expect(load({ LAZYLABEL_DATASET_ROOT: "/data/one" }).databasePath).toBe(
      load({ LAZYLABEL_DATASET_ROOT: "/data/two" }).databasePath,
    );
  });

  it("can be put elsewhere", () => {
    expect(load({ LAZYLABEL_DB: ":memory:" }).databasePath).toBe(":memory:");
  });
});

describe("the inference service", () => {
  it("is ABSENT by default, which is a supported deployment", () => {
    // Everything except SAM prompts and propagation works without it. A machine with no GPU should
    // run the app, not refuse to start.
    expect(load({}).inferenceUrl).toBeNull();
  });

  it("treats an empty variable as absent", () => {
    // Otherwise `LAZYLABEL_INFERENCE_URL=` in a compose file — which is how an operator turns a
    // setting off — becomes an empty base URL and every AI request goes to the API itself.
    expect(load({ LAZYLABEL_INFERENCE_URL: "   " }).inferenceUrl).toBeNull();
  });

  it("takes a URL", () => {
    expect(load({ LAZYLABEL_INFERENCE_URL: "http://127.0.0.1:8788" }).inferenceUrl).toBe(
      "http://127.0.0.1:8788",
    );
  });

  it("strips a trailing slash, so no caller has to think about it", () => {
    expect(load({ LAZYLABEL_INFERENCE_URL: "http://inference:8788/" }).inferenceUrl).toBe(
      "http://inference:8788",
    );
  });

  it("refuses something that is not a URL, quoting it", () => {
    // A typo used to be discoverable only by clicking an object and getting a connection error.
    expect(() => load({ LAZYLABEL_INFERENCE_URL: "127.0.0.1:8788" })).toThrow(/"127\.0\.0\.1:8788"/);
  });

  it("refuses a scheme that is not http or https", () => {
    // `file:` parses as a URL and would be attempted. So would a `javascript:` one.
    expect(() => load({ LAZYLABEL_INFERENCE_URL: "file:///models" })).toThrow(/http or https/);
  });
});

describe("the host", () => {
  it("binds loopback by default", () => {
    // Decision 3 is single-user self-hosted. Binding every interface by default would put an
    // unauthenticated API on the network of anyone who ran it without reading the docs.
    expect(load({}).host).toBe("127.0.0.1");
  });

  it("can be opened up deliberately", () => {
    expect(load({ LAZYLABEL_HOST: "0.0.0.0" }).host).toBe("0.0.0.0");
  });
});

describe("the desktop app's settings directory (Phase 4 exit criterion 3)", () => {
  it("defaults to where legacy keeps them, so moving on the same machine needs no configuration", () => {
    expect(load({}).legacySettingsDir).toBe(path.join(os.homedir(), ".config", "lazylabel"));
  });

  it("can point somewhere else, resolved to an absolute path", () => {
    expect(load({ LAZYLABEL_LEGACY_SETTINGS_DIR: "old-config" }).legacySettingsDir).toBe(
      path.resolve("old-config"),
    );
  });

  it("is turned off by setting it empty", () => {
    expect(load({ LAZYLABEL_LEGACY_SETTINGS_DIR: "" }).legacySettingsDir).toBeNull();
  });
});

describe("the web app's build, which the API serves (DEPLOYABILITY.md R3)", () => {
  it("defaults to web/dist beside this package, where the workspace's npm install builds it", () => {
    // Found from the source file here and from dist/src when built, one level apart, so this also
    // holds the walk up to the package's own folder.
    const api = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

    expect(load({}).webRoot).toBe(path.join(api, "..", "web", "dist"));
  });

  it("can point somewhere else, resolved to an absolute path", () => {
    expect(load({ LAZYLABEL_WEB_DIST: "site" }).webRoot).toBe(path.resolve("site"));
  });

  it("is turned off by setting it empty, for an API behind a separate web server", () => {
    expect(load({ LAZYLABEL_WEB_DIST: "" }).webRoot).toBeNull();
  });
});
