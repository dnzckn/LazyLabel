/**
 * The system's own folder dialog, shown on the computer the API runs on: the file panel's Open Image
 * Folder, by the owner's request of 2026-09-29 -- "when starting the launch.cmd it asked me for a
 * folder for images, why is that a part of the launch? in the gui the user should be able to select
 * a folder to load".
 *
 * Legacy's button opens `QFileDialog.getExistingDirectory(self, "Select Image Folder")`
 * (main_window.py:1431-1438), a dialog of the desktop the app runs on. The web app runs in a browser,
 * which can pick files to upload but cannot name a folder on disk, so the API shows the dialog, on
 * its own desktop: which is the user's, since the launcher runs LazyLabel on their own computer
 * (`cli.ts` sets LAZYLABEL_FOLDER_CHOICE to "dialog" only where there is a desktop to show one on).
 *
 * The dialogs were the launcher's until then, shown before the server started (DEPLOYABILITY.md R11).
 * This module is what is left of that: the programs, and running one. NOTHING HERE MAY IMPORT
 * `node:sqlite`, for the reason `launcher.ts` gives: `cli.ts` imports this before the Node check.
 */

import { spawn } from "node:child_process";
import * as path from "node:path";

/** A program that shows the system's own folder dialog and prints the folder chosen. */
export interface FolderDialog {
  readonly command: string;
  readonly args: readonly string[];
}

/** Legacy's title for its folder dialog (main_window.py:1433). */
export const DIALOG_TITLE = "Select Image Folder";

/**
 * Windows PowerShell 5.1, in every Windows since 10: the Windows Forms folder dialog. Its owner is
 * a form kept on top, or the dialog can open behind the browser the user clicked in. The path goes
 * out as UTF-8 bytes, because the console's own code page would mangle a name outside it.
 */
const WINDOWS_DIALOG = [
  "Add-Type -AssemblyName System.Windows.Forms",
  "$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false }",
  "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
  `$dialog.Description = '${DIALOG_TITLE}'`,
  "$dialog.ShowNewFolderButton = $false",
  "$dialog.SelectedPath = [Environment]::GetFolderPath('MyPictures')",
  "if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {",
  "  $bytes = [System.Text.Encoding]::UTF8.GetBytes($dialog.SelectedPath)",
  "  $out = [Console]::OpenStandardOutput()",
  "  $out.Write($bytes, 0, $bytes.Length)",
  "  $out.Flush()",
  "}",
].join("\n");

/**
 * The system's own folder dialogs on this computer, in the order to try them. Each prints the folder
 * chosen, and nothing when it is closed. None where there is no desktop, and then the folder's path
 * is typed in the app instead (`cli.ts`, LAZYLABEL_FOLDER_CHOICE=path).
 */
export function folderDialogs(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, home: string): FolderDialog[] {
  if (platform === "win32") {
    // The full path, so a powershell.exe earlier on the PATH is never the one run.
    const system = (env["SystemRoot"] ?? env["SYSTEMROOT"] ?? "").trim() || "C:\\Windows";
    return [
      {
        command: path.win32.join(system, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
        args: [
          "-NoProfile",
          "-NonInteractive",
          "-STA",
          "-EncodedCommand",
          Buffer.from(WINDOWS_DIALOG, "utf16le").toString("base64"),
        ],
      },
    ];
  }
  if (platform === "darwin") {
    // `activate` first: the dialog belongs to osascript, which the API starts in the background
    // while the browser is in front, and it would otherwise open behind the browser's window.
    return [
      {
        command: "/usr/bin/osascript",
        args: ["-e", "activate", "-e", `POSIX path of (choose folder with prompt "${DIALOG_TITLE}")`],
      },
    ];
  }
  if ((env["DISPLAY"] ?? "").trim() === "" && (env["WAYLAND_DISPLAY"] ?? "").trim() === "") return [];
  return [
    { command: "zenity", args: ["--file-selection", "--directory", `--title=${DIALOG_TITLE}`] },
    { command: "kdialog", args: ["--getexistingdirectory", home, "--title", DIALOG_TITLE] },
  ];
}

/** The folder a dialog printed, or null when it printed none because it was closed. */
export function dialogFolder(output: string): string | null {
  const folder = output.replace(/[\r\n]+$/, "");
  return folder === "" ? null : folder;
}

/** The folder the dialog printed; null when it was closed or failed; "missing" when it is not installed. */
export function showDialog(dialog: FolderDialog): Promise<string | null | "missing"> {
  return new Promise((resolve) => {
    let output = "";
    try {
      const child = spawn(dialog.command, [...dialog.args], { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        output += chunk;
      });
      child.once("error", () => resolve("missing"));
      child.once("close", (code) => resolve(code === 0 ? dialogFolder(output) : null));
    } catch {
      resolve("missing");
    }
  });
}

/**
 * The first of `dialogs` this computer has, shown: the folder chosen, null when it was closed, or
 * "missing" when none of them could be shown. A dialog that is not installed gives way to the next,
 * as kdialog does to zenity; one that was closed is the user's answer.
 */
export async function chooseFolder(
  dialogs: readonly FolderDialog[],
  show: (dialog: FolderDialog) => Promise<string | null | "missing"> = showDialog,
): Promise<string | null | "missing"> {
  for (const dialog of dialogs) {
    const shown = await show(dialog);
    if (shown !== "missing") return shown;
  }
  return "missing";
}
