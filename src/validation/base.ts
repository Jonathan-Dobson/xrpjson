/**
 * Base transaction validation.
 *
 * Validates the common fields present on every XRPL transaction.
 */
import { ValidationError } from '../errors.js';
import {
  isRecord,
  isString,
  isNumber,
  isArray,
  isAccount,
  isMemo,
  isSigner,
} from './helpers.js';

/**
 * Validate the common fields of a transaction object.
 *
 * @param tx - A record to validate as a base transaction.
 * @throws ValidationError when required fields are missing or invalid.
 */
export function validateBaseTransaction(tx: Record<string, unknown>): void {
  if (!isRecord(tx)) {
    throw new ValidationError('Transaction: expected a valid object');
  }

  if (tx['TransactionType'] === undefined) {
    throw new ValidationError('Transaction: missing field TransactionType');
  }

  if (!isString(tx['TransactionType'])) {
    throw new ValidationError('Transaction: TransactionType must be a string');
  }

  if (tx['Account'] === undefined) {
    throw new ValidationError('Transaction: missing field Account');
  }

  if (!isString(tx['Account'])) {
    throw new ValidationError('Transaction: Account must be a string');
  }

  // Optional field validations
  if (tx['Fee'] !== undefined && !isString(tx['Fee'])) {
    throw new ValidationError('Transaction: Fee must be a string');
  }

  if (tx['Sequence'] !== undefined && !isNumber(tx['Sequence'])) {
    throw new ValidationError('Transaction: Sequence must be a number');
  }

  if (tx['AccountTxnID'] !== undefined && !isString(tx['AccountTxnID'])) {
    throw new ValidationError('Transaction: AccountTxnID must be a string');
  }

  if (tx['LastLedgerSequence'] !== undefined && !isNumber(tx['LastLedgerSequence'])) {
    throw new ValidationError('Transaction: LastLedgerSequence must be a number');
  }

  if (tx['Memos'] !== undefined) {
    const memos = tx['Memos'];
    if (!isArray(memos) || !memos.every(isMemo)) {
      throw new ValidationError('Transaction: invalid Memos');
    }
  }

  if (tx['Signers'] !== undefined) {
    const signers = tx['Signers'];
    if (!isArray(signers) || signers.length === 0 || !signers.every(isSigner)) {
      throw new ValidationError('Transaction: invalid Signers');
    }
  }

  if (tx['SourceTag'] !== undefined && !isNumber(tx['SourceTag'])) {
    throw new ValidationError('Transaction: SourceTag must be a number');
  }

  if (tx['SigningPubKey'] !== undefined && !isString(tx['SigningPubKey'])) {
    throw new ValidationError('Transaction: SigningPubKey must be a string');
  }

  if (tx['TicketSequence'] !== undefined && !isNumber(tx['TicketSequence'])) {
    throw new ValidationError('Transaction: TicketSequence must be a number');
  }

  if (tx['TxnSignature'] !== undefined && !isString(tx['TxnSignature'])) {
    throw new ValidationError('Transaction: TxnSignature must be a string');
  }

  if (tx['NetworkID'] !== undefined && !isNumber(tx['NetworkID'])) {
    throw new ValidationError('Transaction: NetworkID must be a number');
  }

  if (tx['Delegate'] !== undefined) {
    if (!isAccount(tx['Delegate'])) {
      throw new ValidationError('Transaction: invalid Delegate');
    }
    if (tx['Delegate'] === tx['Account']) {
      throw new ValidationError(
        'Transaction: Account and Delegate addresses cannot be the same',
      );
    }
  }
}
