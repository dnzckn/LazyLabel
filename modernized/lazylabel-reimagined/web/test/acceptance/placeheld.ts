/**
 * Capabilities the web app's acceptance suite holds a placeholder for.
 *
 * A plain module, not part of a test file: importing one test file from another registers its
 * tests twice, which the API package learned the hard way.
 */

/**
 * EMPTY, and kept rather than deleted.
 *
 * C11 was the last entry, and it came off when the propagation controls landed and an acceptance
 * test drove them through the shell. The list stays because the guard around it is what stops a
 * capability being marked built with no acceptance test behind it -- the exact failure this whole
 * table exists to prevent -- and the next capability to be started needs it in place.
 */
export const PLACEHELD: readonly string[] = [];
