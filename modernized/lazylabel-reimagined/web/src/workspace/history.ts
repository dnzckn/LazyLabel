/**
 * The undo stack — RULE-052, with the two defects on its card designed out rather than ported.
 *
 * The architecture puts this in the browser: the undo STACK is client state, and the undo
 * OPERATIONS it replays are library calls. So this holds entries and decides what may be undone;
 * it knows nothing about masks, classes or files.
 *
 * WHAT IS KEPT FROM THE CARD
 *
 *   - any new recorded action clears the redo stack;
 *   - history is cleared when a new image or timeline frame loads.
 *
 * WHAT IS NOT
 *
 * RULE-052 records that a `delete_segments` handler exists and nothing ever records that action,
 * so deletions are not undoable AND, worse, an unrecorded deletion shifts the indices of everything
 * after it — which makes a later undo remove the WRONG segment. An entry that can be recorded but
 * not replayed is a trap, so `record` takes an operation that knows how to invert itself: there is
 * no way to record something undoable-in-name-only.
 *
 * RULE-053 records that undoing an erase appends malformed segments, because erase stores wrapper
 * objects and undo passes them straight to the add path. Same shape of bug, same answer: an entry
 * carries its own `undo` and `redo`, so nothing has to guess what a payload means.
 *
 * THE DEPTH LIMIT IS BYTES, NOT ENTRIES. Legacy has no cap at all (the card says so), and an entry
 * count would be a poor one here: one entry can hold a full-image mask and the next can hold a
 * moved vertex, differing by seven orders of magnitude. `AI_NATIVE_SPEC.md` asks for a bound on
 * retained bytes, so entries declare their cost and the oldest are dropped when the total is
 * exceeded.
 */

/** What an entry must be able to do. Both directions, or it is not an undoable action. */
export interface HistoryOperation {
  /** Short label, for a menu item or a tooltip: "Erase", "Add polygon". */
  readonly label: string;
  /** Roughly how much memory this entry retains. Used to bound the stack. */
  readonly bytes: number;
  /**
   * Opaque names for what this entry's undo would touch, so `clear(scope)` can drop it.
   *
   * Deliberately opaque: this class knows nothing about images or sides, and giving it a workspace
   * concept to reason about would be the first of many. An entry that touches two things declares
   * both, and clearing EITHER drops it -- a linked edit cannot be half undone.
   */
  readonly scope?: readonly string[];
  undo(): void;
  redo(): void;
}

export interface HistoryState {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** What undo would do next, for a menu label. Null when there is nothing to undo. */
  readonly undoLabel: string | null;
  readonly redoLabel: string | null;
  readonly entries: number;
  readonly bytes: number;
  /** Entries dropped because the stack was full. Non-zero means some history is unreachable. */
  readonly dropped: number;
}

/** 256 MB of retained edits: generous for a session, and bounded. */
export const DEFAULT_MAX_BYTES = 256 * 1024 * 1024;

export class History {
  private undoStack: HistoryOperation[] = [];
  private redoStack: HistoryOperation[] = [];
  private retained = 0;
  private droppedCount = 0;
  private readonly listeners = new Set<(state: HistoryState) => void>();

  constructor(private readonly maxBytes: number = DEFAULT_MAX_BYTES) {
    if (maxBytes < 1) throw new RangeError("a history with no capacity cannot record anything");
  }

  get state(): HistoryState {
    return {
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      undoLabel: this.undoStack.at(-1)?.label ?? null,
      redoLabel: this.redoStack.at(-1)?.label ?? null,
      entries: this.undoStack.length,
      bytes: this.retained,
      dropped: this.droppedCount,
    };
  }

  /** Record an action that has just happened. Clears the redo stack, per RULE-052. */
  record(operation: HistoryOperation): void {
    if (!Number.isFinite(operation.bytes) || operation.bytes < 0) {
      throw new RangeError(`${operation.label} declared ${operation.bytes} bytes`);
    }

    this.undoStack.push(operation);
    this.retained += operation.bytes;

    // Redoing after a new action would replay an edit into a document that has moved on. Legacy
    // clears it here too, and it is the one part of the card with no defect attached.
    this.redoStack = [];

    this.trim();
    this.announce();
  }

  undo(): boolean {
    const operation = this.undoStack.pop();
    if (operation === undefined) return false;

    this.retained -= operation.bytes;
    operation.undo();
    this.redoStack.push(operation);
    this.announce();
    return true;
  }

  redo(): boolean {
    const operation = this.redoStack.pop();
    if (operation === undefined) return false;

    operation.redo();
    this.undoStack.push(operation);
    this.retained += operation.bytes;
    this.trim();
    this.announce();
    return true;
  }

  /**
   * Forget everything, which is what loading a new image does (RULE-052).
   *
   * Not merely tidiness: an entry undoes an edit to a PARTICULAR image, and replaying one against
   * a different image would corrupt it silently.
   *
   * With a `scope`, forget only the entries that declared it. That is the same rule once the
   * workspace can hold more than one image at a time: loading into one side must forget that
   * side's edits and leave the other side's alone, which an unscoped clear would destroy.
   *
   * AN ENTRY THAT DECLARED NO SCOPE IS DROPPED BY EVERY CLEAR, scoped or not. It has not said what
   * it touches, so there is no way to prove it safe to keep -- and a surviving entry that turns out
   * to edit the image just closed is exactly the silent corruption above.
   *
   * Dropping from the middle is safe because the entries left behind are independent of the ones
   * removed: each undoes its own side, so unwinding them in their own order still reaches the
   * state each expects. That is a property of the caller's scopes, not of this class, which is why
   * scope is the caller's word rather than an index this class invents.
   */
  clear(scope?: string): void {
    if (scope === undefined) {
      this.undoStack = [];
      this.redoStack = [];
      this.retained = 0;
      this.droppedCount = 0;
      this.announce();
      return;
    }

    const survives = (operation: HistoryOperation): boolean =>
      operation.scope !== undefined && !operation.scope.includes(scope);

    this.undoStack = this.undoStack.filter(survives);
    this.redoStack = this.redoStack.filter(survives);
    // Recomputed rather than subtracted: a sum maintained across two filters is one arithmetic
    // slip away from a stack that trims forever or never.
    this.retained = this.undoStack.reduce((total, operation) => total + operation.bytes, 0);
    // `droppedCount` is untouched on purpose. It means "history you can no longer reach because
    // the stack was full", which is a thing to warn about; forgetting a closed image's edits is
    // the rule working, and counting it would raise that warning on every image change.
    this.announce();
  }

  subscribe(listener: (state: HistoryState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Drop the oldest entries until the retained bytes fit. */
  private trim(): void {
    while (this.retained > this.maxBytes && this.undoStack.length > 1) {
      const dropped = this.undoStack.shift()!;
      this.retained -= dropped.bytes;
      this.droppedCount += 1;
    }

    // A single entry larger than the whole budget is kept: dropping it would leave the user with
    // an action they can see in the menu and cannot undo, which is worse than briefly exceeding a
    // limit that exists to protect them from exactly that confusion.
  }

  private announce(): void {
    const state = this.state;
    for (const listener of this.listeners) listener(state);
  }
}
