/**
 * The classes on this image: their names, their order, and renumbering them.
 *
 * ORDER IS NOT DECORATION HERE. RULE-013 renumbers classes 0..N-1 in the order shown, and the class
 * ids are what the exported files carry — an NPZ's channel order and a COCO file's category ids.
 * So moving a row and pressing Reassign changes what the files say, which is why the button names
 * its effect and why the table shows the id that each class WILL take.
 *
 * NAMES ARE PER IMAGE, under decision 6. "car" can be class 1 in one file and class 2 in the next,
 * and the alias table travels with the file. That is a real cost of keeping legacy's exports
 * byte-identical, and the panel says so rather than letting a user assume a project-wide list.
 */

import { useCallback, useState, type ReactNode } from "react";

import { classColor } from "../canvas/classColor.js";
import { reassignClassIds } from "./classes.js";
import { useNotifications } from "../notifications/NotificationProvider.jsx";
import { useWorkspace } from "./WorkspaceProvider.jsx";

/**
 * One class's name, committed once when the user finishes typing, as legacy's table commits an edit
 * (right_panel.py:192, 228-240): on Enter or on leaving the field. Escape puts the name back.
 *
 * Committing on every keystroke could not work. The store trims a name and ignores an unchanged
 * one, so the space typed between "stop" and "sign" was trimmed away as it was typed and the field
 * reverted -- a two-word name could only be pasted -- and every keystroke was an undo step.
 */
function AliasField({
  classId,
  value,
  onCommit,
}: {
  readonly classId: number;
  readonly value: string;
  readonly onCommit: (name: string) => void;
}): ReactNode {
  /** What the user is typing, or null while they are not editing and the stored name shows. */
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    onCommit(draft);
  };

  return (
    <input
      type="text"
      value={draft ?? value}
      placeholder={String(classId)}
      aria-label={`Name for class ${classId}`}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
        else if (event.key === "Escape") setDraft(null);
      }}
    />
  );
}

export function ClassTable(): ReactNode {
  const { segments, classAliases, setClassAlias, applyClasses, activeClassId, toggleActiveClass } =
    useWorkspace();
  const { notify } = useNotifications();

  /** The user's arrangement, or null while they have not moved anything. */
  const [order, setOrder] = useState<readonly number[] | null>(null);

  const present = [
    ...new Set(
      segments
        .map((segment) => segment.classId)
        .filter((classId): classId is number => classId !== null && classId !== undefined),
    ),
  ].sort((a, b) => a - b);

  // A stored order can go stale when a class disappears, so it is filtered against what is
  // actually here and topped up with anything new.
  const shown = order === null
    ? present
    : [...order.filter((id) => present.includes(id)), ...present.filter((id) => !order.includes(id))];

  const move = useCallback(
    (from: number, to: number) => {
      if (to < 0 || to >= shown.length) return;
      const next = [...shown];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved!);
      setOrder(next);
    },
    [shown],
  );

  const reassign = useCallback(() => {
    const result = reassignClassIds(segments, classAliases, shown);
    applyClasses(result.segments, result.aliases, "Reassign class ids");
    setOrder(null);

    if (result.collisions.length > 0) {
      // Legacy's silent defect: a class the order did not mention keeps its id, and that id may
      // now belong to something else. Two unrelated objects share a class, in the file.
      notify({
        severity: "warning",
        message: `Class ${result.collisions.join(", ")} now has more than one meaning`,
        detail:
          "Some annotations had a class the table did not list, so they kept their old id — which "
          + "has since been given to a different class. Check them before saving.",
      });
    }

    if (result.droppedAliases.length > 0) {
      notify({
        severity: "warning",
        message: `Dropped ${result.droppedAliases.length} class name${result.droppedAliases.length === 1 ? "" : "s"}`,
        detail: `No annotation used ${result.droppedAliases.join(", ")}, so the name was not kept.`,
      });
    }
  }, [applyClasses, classAliases, notify, segments, shown]);

  if (present.length === 0) {
    return <p className="panel__missing">No classes on this image yet.</p>;
  }

  const changed = shown.some((classId, position) => classId !== position);

  return (
    <>
      <p className="classes__label">Class Order:</p>
      {/* Legacy's class table (right_panel.py:172-201): the name, then the id, each row in its
          class's colour, and the ACTIVE class -- the one new annotations get -- in bold with a
          marker (295-314). Clicking a class makes it active, as in legacy; clicking it again goes
          back to the next free id. */}
      <table className="classes">
        <thead>
          <tr>
            <th scope="col">Alias</th>
            <th scope="col">Class ID</th>
            <th scope="col">
              <span className="visually-hidden">Order</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((classId, position) => (
            <tr
              key={classId}
              className={`class-row${activeClassId === classId ? " classes__row--active" : ""}`}
              style={{ backgroundColor: swatch(classId) }}
            >
              <td className="classes__alias">
                <AliasField
                  classId={classId}
                  value={classAliases[String(classId)] ?? ""}
                  onCommit={(name) => setClassAlias(classId, name)}
                />
              </td>
              <th scope="row">
                <button
                  type="button"
                  className="classes__use"
                  aria-pressed={activeClassId === classId}
                  aria-label={`Draw new annotations as class ${classId}`}
                  // Legacy's class toggle, with its words (main_window.py:2697-2710).
                  onClick={() =>
                    notify({
                      severity: "info",
                      message: toggleActiveClass(classId)
                        ? `Class ${classId} activated for new segments`
                        : "No active class - new segments will create new classes",
                    })
                  }
                >
                  {classId}
                </button>
                {/* What Reassign would make it. Shown only when it differs, so the column is a
                    warning rather than a repetition. */}
                {classId !== position && <span className="classes__to"> → {position}</span>}
              </th>
              <td className="classes__order">
                {/* Buttons rather than drag-and-drop: a reorder that only works with a mouse is a
                    reorder half the users cannot perform, and this one changes the exported file. */}
                <button
                  type="button"
                  onClick={() => move(position, position - 1)}
                  disabled={position === 0}
                  aria-label={`Move class ${classId} up`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(position, position + 1)}
                  disabled={position === shown.length - 1}
                  aria-label={`Move class ${classId} down`}
                >
                  ↓
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button type="button" onClick={reassign} disabled={!changed}>
        {changed ? `Renumber ${shown.length} classes to match this order` : "Order matches the ids"}
      </button>

      <p className="panel__missing">
        Class names belong to this image. The same name can have a different id in another file.
      </p>
    </>
  );
}

function swatch(classId: number): string {
  const { r, g, b } = classColor(classId);
  return `rgb(${r}, ${g}, ${b})`;
}
