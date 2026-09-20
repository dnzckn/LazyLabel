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

export function ClassTable(): ReactNode {
  const { segments, classAliases, setClassAlias, applyClasses } = useWorkspace();
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
      <table className="classes">
        <thead>
          <tr>
            <th scope="col">Class</th>
            <th scope="col">Name</th>
            <th scope="col">Order</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((classId, position) => (
            <tr key={classId}>
              <th scope="row">
                <span className="swatch" style={{ background: swatch(classId) }} aria-hidden="true" />{" "}
                {classId}
                {/* What Reassign would make it. Shown only when it differs, so the column is a
                    warning rather than a repetition. */}
                {classId !== position && <span className="classes__to"> → {position}</span>}
              </th>
              <td>
                <input
                  type="text"
                  value={classAliases[String(classId)] ?? ""}
                  placeholder={String(classId)}
                  aria-label={`Name for class ${classId}`}
                  onChange={(event) => setClassAlias(classId, event.target.value)}
                />
              </td>
              <td>
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
