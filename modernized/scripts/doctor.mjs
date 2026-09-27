/**
 * `npm run doctor ["<folder>"]`: what stands between this computer and LazyLabel, each with the
 * command that fixes it.
 *
 * DEPLOYABILITY.md R9. It checks, OK or FAIL: the Node version and `node:sqlite`, that everything
 * is built, the port, that the folder of images can be read and the settings location written;
 * and, when the AI tools are installed (`inference/.venv`, or LAZYLABEL_PYTHON), runs their own
 * check, `python -m lazylabel_inference.doctor`: PyTorch and CUDA, the device, whether cv2, sam2
 * and segment_anything import, the manifest, and each checkpoint's presence and size. The AI tools
 * are optional, so their absence is a note, not a failure. Exits 1 when anything failed.
 *
 *   npm run doctor "<folder>"                 in any shell
 *   node scripts/doctor.mjs "<folder>" --full --port 8790
 *
 * `--full` hashes every checkpoint too (a gigabyte takes seconds); `--port` checks another port
 * than 8787. PowerShell's npm drops options after `npm run doctor`, so give them to node directly.
 */

import { spawnSync } from "node:child_process";
import * as path from "node:path";

import { INFERENCE, MODERNIZED, aiPython } from "./lib/ai.mjs";
import { checkBuilds, checkFolder, checkNode, checkPort, checkSettings, checkSqlite, finding, render } from "./lib/doctor.mjs";

const USAGE = 'Usage: npm run doctor ["<folder of images>"]\n   or: node scripts/doctor.mjs ["<folder>"] [--port 8787] [--full]';

process.exit(await main(process.argv.slice(2)));

async function main(args) {
  let port = Number(process.env["LAZYLABEL_PORT"] ?? 8787);
  let full = false;
  const folders = [];
  for (let index = 0; index < args.length; index += 1) {
    const word = args[index];
    if (word === "-h" || word === "--help") {
      console.log(USAGE);
      return 0;
    }
    if (word === "--full") full = true;
    else if (word === "--port") port = Number(args[(index += 1)]);
    else if (word.startsWith("--port=")) port = Number(word.slice("--port=".length));
    else if (word.startsWith("-")) {
      console.error(`There is no option ${word}.\n${USAGE}`);
      return 2;
    } else folders.push(word);
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535 || folders.length > 1) {
    console.error(USAGE);
    return 2;
  }
  // npm runs this in modernized/; a relative folder means the one the command was typed in.
  const folder = folders[0] === undefined ? undefined : path.resolve(process.env["INIT_CWD"] || process.cwd(), folders[0]);

  console.log("LazyLabel doctor\n");
  const findings = [
    checkNode(process.versions.node),
    await checkSqlite(),
    checkBuilds(MODERNIZED),
    await checkPort(port),
    checkFolder(folder),
    checkSettings(),
  ];

  const python = aiPython();
  const named = (process.env["LAZYLABEL_PYTHON"] ?? "").trim() !== "";
  if (python === null) {
    findings.push(
      named
        ? finding(false, `LAZYLABEL_PYTHON names ${path.resolve(process.env["LAZYLABEL_PYTHON"])}, which is not there`, "unset it, or npm run ai:setup")
        : finding(null, "the AI tools are not installed; they are optional: npm run ai:setup"),
    );
  }
  console.log(render(findings));

  let aiFailed = false;
  if (python !== null) {
    console.log(`\nThe AI tools, in ${python}:`);
    const ai = spawnSync(python, ["-m", "lazylabel_inference.doctor", ...(full ? ["--full"] : [])], {
      stdio: "inherit",
      windowsHide: true,
      // From the package's source, so an environment without the package installed runs this copy.
      cwd: path.join(INFERENCE, "src"),
    });
    aiFailed = ai.status !== 0;
    if (ai.error !== undefined) console.log(render([finding(false, `it did not run: ${ai.error.message}`, "npm run ai:setup")]));
  }

  const failed = findings.some((each) => each.ok === false) || aiFailed;
  console.log(failed ? "\nSomething needs fixing: each FAIL above says how." : "\nEverything LazyLabel needs is in place.");
  return failed ? 1 : 0;
}
