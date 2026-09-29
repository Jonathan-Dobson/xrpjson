/**
 * Custom error types for the xrplt package.
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
 * Thrown when a transaction operation fails (e.g. unknown type in registry).
 */
export class TransactionError extends Error {
  override readonly name = 'TransactionError';

  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, TransactionError.prototype);
  }
}
