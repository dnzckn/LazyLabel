/**
 * `npm run ai:models [name]`: the checkpoints the AI tools use, fetched verified, when asked.
 *
 * DEPLOYABILITY.md R7. `npm run ai:models` lists what can be fetched; `npm run ai:models
 * sam2.1-large` shows the size, asks, downloads (resuming an interrupted download), checks the size
 * and the SHA-256, and only then lists the file in the model folder's `manifest.json`, which is
 * where `npm start` looks. It is `lazylabel-models` (`lazylabel_inference/fetch.py`), run in the
 * environment `npm run ai:setup` made. The service itself never downloads anything.
 *
 * The folder is per user (`lazylabel_inference.fetch.default_model_dir`), or LAZYLABEL_MODEL_DIR.
 * `--dir` and `--yes` reach it from bash as `npm run ai:models -- sam2.1-large --dir <folder>`;
 * PowerShell's npm drops that `--`, so there run the environment's own `lazylabel-models` instead.
 */

import { spawnSync } from "node:child_process";
import * as path from "node:path";

import { INFERENCE, aiPython } from "./lib/ai.mjs";

const args = process.argv.slice(2);
const python = aiPython();
if (python === null) {
  console.error("The AI tools are not installed yet: run npm run ai:setup first, then this again.");
  process.exit(1);
}

// A bare name is a fetch, and nothing at all is the list; a subcommand or an option goes as it is.
const command =
  args.length === 0 ? ["list"] : ["list", "fetch"].includes(args[0]) || args[0].startsWith("-") ? args : ["fetch", ...args];
const result = spawnSync(python, ["-m", "lazylabel_inference.fetch", ...command], {
  stdio: "inherit",
  windowsHide: true,
  // From the package's source folder, so an environment named by LAZYLABEL_PYTHON that does not
  // have the package installed still runs this checkout's copy.
  cwd: path.join(INFERENCE, "src"),
});
process.exit(result.status ?? 1);
