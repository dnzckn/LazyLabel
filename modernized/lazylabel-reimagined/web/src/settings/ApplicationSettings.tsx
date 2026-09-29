/**
 * Legacy's Application Settings group: its controls, in its order (`settings_widget.py:33-110`).
 * Auto-Save on Navigate, Export Formats, Operate On View, Enable Pixel Priority with its Ascending
 * and Descending pair indented under it, and Reset to Default.
 *
 * OPERATE ON VIEW AND PIXEL PRIORITY WERE IN A DIALOG from 2026-09-23, behind an "Edit settings"
 * button here, with pan, join and the streaming window. On 2026-09-29 the owner did not find them:
 * "i dont see any of the pixel priority settings, ensure all the settings that were in pyqt6 are
 * implemented and avilable here too". So each is where legacy shows it: these two here, Pan and
 * Join in the Image tab's Annotation Settings (`AnnotationSettingsPanel.tsx`), and the Window in
 * the Sequence tab's Propagation group, which already had it. Nothing legacy shows was left in the
 * dialog, so it went, with its button.
 *
 * Each is saved as it changes, as every setting here is (decision 7); a save the API refuses is
 * taken back and said by the provider. What each does is its tooltip, legacy's
 * (`settings_widget.py:39-102`), with no paragraph (the owner, 2026-09-26).
 */

import { useId, type ReactNode } from "react";

import { ExportFormats } from "../dataset/ExportFormats.jsx";
import { ResetSettings } from "./ResetSettings.jsx";
import { useSettings } from "./SettingsProvider.jsx";

/** Legacy's tooltips, word for word except Auto-Save's, whose list names this app's ways to move. */
const TIPS = {
  autoSave:
    "Automatically save work when switching to any new image (navigation keys, the file list, the timeline)",
  operateOnView:
    "If checked, SAM model will operate on the currently displayed (adjusted) image.\nOtherwise, it operates on the original image.",
  pixelPriority: "Control pixel ownership when multiple classes overlap",
  ascending: "Lower class indices take priority over higher ones",
  descending: "Higher class indices take priority over lower ones",
} as const;

export function ApplicationSettings(): ReactNode {
  const { settings, save } = useSettings();
  const values = settings.values;
  // The pair's group name, one per mount, so two of these could never share a radio group.
  const direction = useId();

  const put = (key: string, value: unknown) => {
    void save({ ...settings, values: { ...values, [key]: value } });
  };

  const priority = values["pixel_priority_enabled"] === true;
  const ascending = values["pixel_priority_ascending"] !== false;

  return (
    <div className="app-settings">
      {/* On by default, as legacy's (settings_widget.py:38-44). Moving to another image saves the
          one being left, by the owner's decision of 2026-09-25; off, the move asks instead. */}
      <label title={TIPS.autoSave}>
        <input
          type="checkbox"
          checked={values["auto_save"] !== false}
          onChange={(event) => put("auto_save", event.currentTarget.checked)}
        />{" "}
        Auto-Save on Navigate
      </label>

      <ExportFormats />

      {/* RULE-089: off, the model sees the decoded image; on, the picture on screen, adjusted. */}
      <label title={TIPS.operateOnView}>
        <input
          type="checkbox"
          checked={values["operate_on_view"] === true}
          onChange={(event) => put("operate_on_view", event.currentTarget.checked)}
        />{" "}
        Operate On View
      </label>

      {/* RULE-012: which class keeps a pixel two classes share, when a save writes the masks. */}
      <label title={TIPS.pixelPriority}>
        <input
          type="checkbox"
          checked={priority}
          onChange={(event) => put("pixel_priority_enabled", event.currentTarget.checked)}
        />{" "}
        Enable Pixel Priority
      </label>
      {/* Legacy's direction pair, 20px in under the switch and live only while it is on, Ascending
          by default (settings_widget.py:75-102, 142-146). */}
      <div className="app-settings__indent">
        <label title={TIPS.ascending}>
          <input
            type="radio"
            name={direction}
            checked={ascending}
            disabled={!priority}
            onChange={() => put("pixel_priority_ascending", true)}
          />{" "}
          Ascending
        </label>
        <label title={TIPS.descending}>
          <input
            type="radio"
            name={direction}
            checked={!ascending}
            disabled={!priority}
            onChange={() => put("pixel_priority_ascending", false)}
          />{" "}
          Descending
        </label>
      </div>

      {/* Legacy's last control in the group (settings_widget.py:104-110), for every setting rather
          than the group's five, by the owner's ask of 2026-09-26; hotkeys keep their own. */}
      <ResetSettings />
    </div>
  );
}
