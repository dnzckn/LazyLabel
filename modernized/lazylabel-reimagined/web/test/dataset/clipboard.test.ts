/**
 * Copying to the clipboard: the browser's API, and the older selection copy where it is missing or
 * refused (CONTROL_PARITY.md CP-48).
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { copyText } from "../../src/dataset/clipboard.js";

const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");

function stubClipboard(writeText: ((text: string) => Promise<void>) | undefined): void {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: writeText === undefined ? undefined : { writeText },
  });
}

function stubExecCommand(result: boolean | Error) {
  const copied: string[] = [];
  const execCommand = vi.fn((command: string) => {
    if (result instanceof Error) throw result;
    // What the selection copy would put on the clipboard: the field's text.
    if (command === "copy") copied.push(document.querySelector("textarea")?.value ?? "");
    return result;
  });
  Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });
  return { execCommand, copied };
}

afterEach(() => {
  if (original === undefined) delete (navigator as { clipboard?: unknown }).clipboard;
  else Object.defineProperty(navigator, "clipboard", original);
  delete (document as { execCommand?: unknown }).execCommand;
});

describe("copying text", () => {
  it("uses the browser's clipboard when it is there", async () => {
    const writeText = vi.fn(async () => undefined);
    stubClipboard(writeText);
    const { execCommand } = stubExecCommand(true);

    await expect(copyText("a.png")).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledWith("a.png");
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("copies from a selected field when the browser refuses", async () => {
    stubClipboard(async () => {
      throw new Error("NotAllowedError");
    });
    const { execCommand, copied } = stubExecCommand(true);

    await expect(copyText("a.png\nb.png")).resolves.toBe(true);

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(copied).toEqual(["a.png\nb.png"]);
    // The field is gone again.
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("copies from a selected field where there is no clipboard API", async () => {
    stubClipboard(undefined);
    const { copied } = stubExecCommand(true);

    await expect(copyText("a.png")).resolves.toBe(true);
    expect(copied).toEqual(["a.png"]);
  });

  it("says so when neither way works", async () => {
    stubClipboard(undefined);
    stubExecCommand(new Error("unsupported"));

    await expect(copyText("a.png")).resolves.toBe(false);
  });
});
