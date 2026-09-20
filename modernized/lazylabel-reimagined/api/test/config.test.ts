/**
 * Configuration, and what it refuses at startup.
 *
 * The point of validating here rather than on first use is that a misconfigured service should
 * fail where an operator is looking. A dataset root that does not exist, a port that is not a
 * port, an inference URL with a typo in it — each of those was otherwise discoverable only by a
 * user clicking something and getting an error three layers down, which reads as "the app is
 * broken" rather than "this variable is wrong".
 */

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
  it("lives inside the dataset folder by default", () => {
    // Beside the images rather than in a system directory: decision 5 makes the folder the source
    // of truth, and a database somewhere else is a second thing to back up and to lose.
    expect(load({}).databasePath).toMatch(/[\\/]\.lazylabel[\\/]lazylabel\.db$/);
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
