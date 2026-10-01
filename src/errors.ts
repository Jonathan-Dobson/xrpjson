/**
 * Custom error types for the xrpjson package.
 *
 * These are standalone — no dependency on xrpl's error hierarchy.
 */

/**
 * Thrown when a transaction fails runtime validation.
 */
export class ValidationError extends Error {
  override readonly name = 'ValidationError';

  constructor(message: string) {
    super(message);
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Part of the public `xrpjson/errors` surface. No factory in this
 * package throws it — every eager-validation failure throws
 * `ValidationError` instead. Retained rather than removed because it is
 * exported API and callers may already catch it.
 */
export class TransactionError extends Error {
  override readonly name = 'TransactionError';

  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, TransactionError.prototype);
  }
}
