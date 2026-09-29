/**
 * The system's folder dialog, which the app's Open Image Folder shows on the computer the API runs
 * on: the owner's request of 2026-09-29, "in the gui the user should be able to select a folder to
 * load". Legacy's is `QFileDialog.getExistingDirectory(self, "Select Image Folder")`
 * (main_window.py:1431-1438).
 *
 * The launcher showed these before the server started until then (DEPLOYABILITY.md R11), and these
 * tests came with them from `launcher.test.ts`. None of them opens a dialog: what each platform runs
 * is checked as data, and choosing is checked with a stand-in for showing.
 */

import { describe, expect, it } from "vitest";

import { DIALOG_TITLE, chooseFolder, dialogFolder, folderDialogs, type FolderDialog } from "../src/folderDialog.js";

describe("the folder dialog on each platform", () => {
  it("is titled as legacy's", () => {
    expect(DIALOG_TITLE).toBe("Select Image Folder");
  });

  it("is Windows PowerShell's folder dialog on Windows, by its full path, the script encoded whole", () => {
    const [dialog, ...others] = folderDialogs("win32", { SystemRoot: "C:\\Windows" }, "C:\\Users\\me");

    expect(others).toEqual([]);
    expect(dialog!.command).toBe("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
    expect(dialog!.args.slice(0, 4)).toEqual(["-NoProfile", "-NonInteractive", "-STA", "-EncodedCommand"]);
    const script = Buffer.from(dialog!.args[4]!, "base64").toString("utf16le");
    expect(script).toContain("System.Windows.Forms.FolderBrowserDialog");
    expect(script).toContain("$dialog.Description = 'Select Image Folder'");
    // On top, or it opens behind the browser the user clicked in.
    expect(script).toContain("TopMost = $true");
    expect(script).toContain("UTF8.GetBytes");
  });

  it("is the Finder's choose folder on macOS, brought in front of the browser first", () => {
    expect(folderDialogs("darwin", {}, "/Users/me")).toEqual([
      {
        command: "/usr/bin/osascript",
        args: ["-e", "activate", "-e", 'POSIX path of (choose folder with prompt "Select Image Folder")'],
      },
    ]);
  });

  it("is zenity, then kdialog, on a Linux desktop, and none without one", () => {
    const dialogs = folderDialogs("linux", { WAYLAND_DISPLAY: "wayland-0" }, "/home/me");

    expect(dialogs.map((dialog) => dialog.command)).toEqual(["zenity", "kdialog"]);
    expect(dialogs[0]!.args).toContain("--title=Select Image Folder");
    // Over SSH: the launcher then has the folder's path typed in the app instead (`cli.ts`).
    expect(folderDialogs("linux", {}, "/home/me")).toEqual([]);
  });

  it("reads the folder a dialog printed, and none from one that was closed", () => {
    expect(dialogFolder("/Users/me/Pictures/set/\n")).toBe("/Users/me/Pictures/set/");
    expect(dialogFolder("C:\\Users\\me\\Pictures")).toBe("C:\\Users\\me\\Pictures");
    expect(dialogFolder("")).toBeNull();
  });
});

describe("choosing a folder", () => {
  const zenity: FolderDialog = { command: "zenity", args: [] };
  const kdialog: FolderDialog = { command: "kdialog", args: [] };

  it("takes the folder the first dialog shown gives", async () => {
    const shown: string[] = [];
    const chosen = await chooseFolder([zenity, kdialog], async (dialog) => {
      shown.push(dialog.command);
      return "/home/me/scans";
    });

    expect(chosen).toBe("/home/me/scans");
    expect(shown).toEqual(["zenity"]);
  });

  it("tries the next dialog when one is not installed", async () => {
    const chosen = await chooseFolder([zenity, kdialog], async (dialog) =>
      dialog.command === "zenity" ? "missing" : "/home/me/scans",
    );

    expect(chosen).toBe("/home/me/scans");
  });

  it("takes a closed dialog as the answer, and shows no other", async () => {
    const shown: string[] = [];
    const chosen = await chooseFolder([zenity, kdialog], async (dialog) => {
      shown.push(dialog.command);
      return null;
    });

    expect(chosen).toBeNull();
    expect(shown).toEqual(["zenity"]);
  });

  it("says when there was none to show", async () => {
    expect(await chooseFolder([zenity, kdialog], async () => "missing")).toBe("missing");
    expect(await chooseFolder([], async () => "/never")).toBe("missing");
  });
});
