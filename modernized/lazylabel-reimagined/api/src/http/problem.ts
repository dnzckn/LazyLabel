/**
 * Error responses.
 *
 * Every failure is a typed body with a status, never an empty success. `ASSESSMENT.md` 5.4 records
 * the legacy habit this replaces: a failure presented as an empty result, which downstream looks
 * exactly like "there was nothing there". The annotation routes are where that mattered most, and
 * decision 15d makes it explicit — a sidecar that cannot be read is never answered as "no
 * annotations".
 */

export interface Problem {
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly detail?: unknown;
}

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: unknown;

  constructor(status: number, code: string, message: string, detail?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }

  toProblem(): Problem {
    return this.detail === undefined
      ? { status: this.status, code: this.code, message: this.message }
      : { status: this.status, code: this.code, message: this.message, detail: this.detail };
  }
}

export const badRequest = (message: string, detail?: unknown): HttpError =>
  new HttpError(400, "bad_request", message, detail);

export const notFound = (message: string): HttpError => new HttpError(404, "not_found", message);

export const conflict = (code: string, message: string, detail?: unknown): HttpError =>
  new HttpError(409, code, message, detail);

export const unprocessable = (message: string, detail?: unknown): HttpError =>
  new HttpError(422, "unprocessable", message, detail);

export const payloadTooLarge = (message: string): HttpError =>
  new HttpError(413, "payload_too_large", message);
