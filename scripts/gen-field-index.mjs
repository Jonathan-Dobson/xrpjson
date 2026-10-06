/**
 * Generates `src/fp/field-index.ts` and `src/fp/field-index.assert.ts` —
 * the field-ownership index behind Bug #11.
 *
 * WHY A REVERSE INDEX
 * -------------------
 * A factory must reject an unrecognised prop, but the correct rule is not
 * "is this a known field?" — it is "is this a field that belongs to SOME
 * OTHER transaction?". `MaximumAmount` is legitimate on
 * MPTokenIssuanceCreate and wrong on MPTokenIssuanceSet, so a global field
 * list catches nothing and an allowlist needs 79 hand-maintained sets.
 *
 * Inverting to `fieldName -> Set<TransactionType>` and rejecting a key only
 * when it is BOTH known and absent for this type gives three properties:
 *
 *   1. Catches a known field on the wrong type (the bug that started this).
 *   2. Preserves forward-compatibility. `BaseTransactionFields` carries
 *      `[key: string]: unknown` on purpose, for fields the library does not
 *      model yet. A key with no index entry is by definition one of those,
 *      so it passes. An allowlist would convert that hatch into a throw.
 *   3. Can name the correct transaction in the error, which neither an
 *      allowlist nor the ledger codec can do.
 *
 * WHY THE INDEX IS A UNION OF TWO SOURCES
 * ---------------------------------------
 * Either source alone is wrong in a different way, so both are merged.
 *
 * Source A — protocol truth, from `TRANSACTION_FORMATS` in
 * `ripple-binary-codec/src/enums/definitions.json` (a devDependency). This is
 * the ledger's own per-type field table: 82 transaction types, each with the
 * fields that type accepts. Note that xrpl.js does NOT re-export it — the
 * normalised `DEFAULT_DEFINITIONS` object flattens everything into code/name
 * maps (`field` is 722 `name -> {nth, type, header}` entries with no notion of
 * which transaction accepts it). The nested table survives only in the raw
 * `definitions.json`, which is why this generator reads that file directly.
 *
 * Source B — this library's own 79 `XxxProps` interfaces.
 *
 * Why not A alone: the codec lags the library. `AccountSet` declares
 * `NFTokenBrokerFee`, which codec 2.11.0 places only on `NFTokenAcceptOffer`.
 * An index built from A alone would reject a field this library deliberately
 * supports, turning a bugfix into a breaking release.
 *
 * Why not B alone: it only knows what the library already models, so it
 * cannot catch a real protocol field used in the wrong place — precisely the
 * class of mistake the index exists to catch. A contributes 4 such fields.
 *
 * The union has one property that makes it safe: for any field F and type T
 * this library declares F on, T is in the merged owner set. Merging can only
 * ever WIDEN a field's accepted-type set, never narrow it. So the index can
 * reject a field on types that never accepted it, but can never reject one on
 * a type that did. No call that works today can start failing.
 *
 * WHY THIS IS DRIVEN OFF THE BARREL
 * ---------------------------------
 * A regex over factory source matches `export interface XxxProps extends`
 * on one line only. Eight factories wrap that clause onto the next line (the
 * six xchain-* plus permissioned-domain-delete and signer-list-set), so a
 * source regex silently skips them — and six of the eight are xchain, where a
 * missing field is hardest to spot. `src/fp/index.ts` names the module and its
 * Props type for every factory in a uniform shape, so the barrel is the
 * enumeration source of truth.
 *
 * Regenerate with:  node scripts/gen-field-index.mjs
 * The result is committed, so consumers need no build step and the package
 * keeps zero runtime dependencies.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BARREL = join(ROOT, 'src/fp/index.ts');
const FACTORIES = join(ROOT, 'src/fp/factories');
const OUT_INDEX = join(ROOT, 'src/fp/field-index.ts');
const OUT_ASSERT = join(ROOT, 'src/fp/field-index.assert.ts');

/**
 * Fields every factory inherits from BasePropsFields. They are valid on all 79
 * transaction types, so an ownership set for them would be universal and would
 * bloat the table without ever rejecting anything. Excluded from the table AND
 * from the completeness assertion — which is what makes that assertion usable,
 * because `Fee`, `Sequence` and `Memos` never appear in a props interface body.
 */
const BASE_FIELDS = [
  'Account', 'Fee', 'Sequence', 'Flags',
  'Memos', 'Signers', 'SigningPubKey', 'SourceTag',
  'TicketSequence', 'TxnSignature', 'LastLedgerSequence',
  'AccountTxnID', 'NetworkID', 'Delegate',
];

// Methods every frozen tx carries; never real transaction fields. Kept as a
// scope filter for the completeness assertion only — no Props interface
// declares them today, but the assertion should not start firing if one does.
const METHOD_NAMES = ['validate', 'toJSON', 'with'];

// ── 1. Locate the protocol definitions ────────────────────────────────────
/**
 * `TRANSACTION_FORMATS` is the only per-transaction field table the XRPL
 * toolchain ships. It is not in the package's export map, so it is read by
 * path. `dist/enums/` is the published copy, `src/enums/` ships too; both
 * carry the same table.
 */
function findDefinitions() {
  const pkgRoot = join(ROOT, 'node_modules/ripple-binary-codec');
  for (const c of [
    join(pkgRoot, 'dist/enums/definitions.json'),
    join(pkgRoot, 'src/enums/definitions.json'),
  ]) {
    if (existsSync(c)) return c;
  }
  throw new Error(
    'ripple-binary-codec definitions.json not found. Run `npm install` — the ' +
      'protocol table is a devDependency input and the generated index is ' +
      'committed, so this only matters when regenerating.',
  );
}

const DEFS_PATH = findDefinitions();
const codecVersion = JSON.parse(
  readFileSync(join(ROOT, 'node_modules/ripple-binary-codec/package.json'), 'utf8'),
).version;
const TX_FORMATS = JSON.parse(readFileSync(DEFS_PATH, 'utf8')).TRANSACTION_FORMATS;
if (!TX_FORMATS) {
  throw new Error(
    'definitions.json has no TRANSACTION_FORMATS — the codec layout changed. ' +
      'Fix this generator rather than the output.',
  );
}

/**
 * The codec's `common` pseudo-type holds the fields valid on every transaction.
 * It is authoritative for "valid everywhere" in a way BASE_FIELDS is not: the
 * codec's common also carries `PreviousTxnID`, `OperationLimit` and the three
 * `Sponsor*` fields, which this library does not inherit. SponsorshipTransfer
 * declares those three itself.
 *
 * Computed BEFORE the interfaces are read, because BOTH sources must exclude
 * the common set. Excluding it only from the protocol contribution is a live
 * bug: SponsorshipTransfer's own `Sponsor` declarations would land in the index
 * owned by SponsorshipTransfer alone, and `payment({ Sponsor })` — a field the
 * protocol allows on every transaction — would start throwing.
 */
const commonFields = [
  ...new Set([...BASE_FIELDS, ...(TX_FORMATS.common ?? []).map((f) => f.name)]),
].sort();
const isCommon = (name) => commonFields.includes(name);

// ── 2. Enumerate factories from the barrel ────────────────────────────────
const barrel = readFileSync(BARREL, 'utf8');
const blocks = [
  ...barrel.matchAll(/export\s*\{([\s\S]*?)\}\s*from\s*'\.\/factories\/([^']+)'/g),
];

const factories = [];
for (const [, names, modulePath] of blocks) {
  const props = [...names.matchAll(/type\s+(\w+Props)\b/g)][0]?.[1];
  if (!props) continue;
  factories.push({ module: modulePath.replace(/\.js$/, ''), props });
}
if (factories.length !== 79) {
  throw new Error(
    `barrel yielded ${factories.length} factories, expected 79 — the barrel ` +
      'shape changed; fix this generator rather than the output.',
  );
}

// ── 3. Read each factory's own Props interface body ────────────────────────
/** fieldName -> Set<TransactionType literal> */
const owners = new Map();
/** txType -> declared field names (in declaration order) */
const ownFieldsByType = new Map();
/** txType -> { props, module } for the generated assertion file */
const propsOfTxType = new Map();

function addOwner(field, txType) {
  let set = owners.get(field);
  if (!set) {
    set = new Set();
    owners.set(field, set);
  }
  set.add(txType);
}

for (const { module, props } of factories) {
  const file = join(FACTORIES, `${module}.ts`);
  const src = readFileSync(file, 'utf8');

  const decl = new RegExp(`export\\s+interface\\s+${props}\\b[^\\{]*\\{`).exec(src);
  if (!decl) throw new Error(`no Props interface body found for ${props} in ${file}`);

  // Brace-match the interface body. Nested object literal types (Amount,
  // Paths, inner arrays) make a regex unreliable here.
  let depth = 0;
  let end = -1;
  for (let i = decl.index + decl[0].length - 1; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) { end = i; break; }
  }
  if (end === -1) throw new Error(`unterminated interface body for ${props} in ${file}`);
  const body = src.slice(decl.index + decl[0].length - 1, end);

  // The transaction type literal is the first argument to buildFrozenTx.
  const txType = /buildFrozenTx<[^>]*>\(\s*'([^']+)'/.exec(src)?.[1];
  if (!txType) throw new Error(`no buildFrozenTx type literal found in ${file}`);

  const declared = [];
  propsOfTxType.set(txType, { props, module });
  for (const line of body.split('\n')) {
    // Top-level members only: interface body members sit at exactly one
    // indent; nested type members are deeper and are not transaction fields.
    const m = /^\s{2}(?:readonly\s+)?([A-Za-z][A-Za-z0-9]*)\??\s*:/.exec(line);
    if (!m) continue;
    const field = m[1];
    if (METHOD_NAMES.includes(field)) continue;
    if (isCommon(field)) continue;
    declared.push(field);
    addOwner(field, txType);
  }
  ownFieldsByType.set(txType, declared);
}

const implTypes = new Set(propsOfTxType.keys());
const ownFieldSet = new Set(
  [...ownFieldsByType.values()].flat(),
);

// ── 4. Merge in protocol truth ────────────────────────────────────────────
/** fieldName -> Set<txType>, protocol truth restricted to the 79 we implement */
const protocolOwners = new Map();
for (const [txType, fields] of Object.entries(TX_FORMATS)) {
  if (txType === 'common') continue;
  if (!implTypes.has(txType)) continue;
  for (const f of fields) {
    if (isCommon(f.name)) continue;
    let set = protocolOwners.get(f.name);
    if (!set) {
      set = new Set();
      protocolOwners.set(f.name, set);
    }
    set.add(txType);
  }
}

// Merge. `owners` already holds ours; adding protocol owners only widens.
const protocolFields = new Set();
for (const [field, types] of protocolOwners) {
  if (types.size === 0) continue; // owned only by types we do not implement
  protocolFields.add(field);
  for (const t of types) addOwner(field, t);
}

/** Protocol fields this library has no interface for — the new catch surface. */
const protocolOnlyFields = [...protocolFields].filter((f) => !ownFieldSet.has(f)).sort();

// ── 5. Derive the report ───────────────────────────────────────────────────
const rows = [...owners.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([field, types]) =>
    `  ${field}: new Set([${[...types].sort().map((t) => `'${t}'`).join(', ')}] as const),`)
  .join('\n');

const fieldCount = owners.size;
const pairCount = [...owners.values()].reduce((n, s) => n + s.size, 0);
const singleType = [...owners.values()].filter((s) => s.size === 1).length;

// Types that appear in no row. Correct when a factory declares only base
// fields — DIDDelete takes just `Account` per XLS-40 §5.3 — not a skip.
const unrepresented = [...implTypes].filter((t) => {
  for (const set of owners.values()) if (set.has(t)) return false;
  return true;
});

// Divergences between the two sources, reported rather than resolved — each
// one is a deliberate consequence of the union, not an oversight.
const divergences = [];
for (const txType of [...implTypes].sort()) {
  const ours = new Set(ownFieldsByType.get(txType));
  const theirs = new Set(
    (TX_FORMATS[txType] ?? []).map((f) => f.name).filter((n) => !isCommon(n)),
  );
  const weOnly = [...ours].filter((f) => !theirs.has(f)).sort();
  const protoOnly = [...theirs].filter((f) => !ours.has(f)).sort();
  if (weOnly.length || protoOnly.length) divergences.push({ txType, weOnly, protoOnly });
}

// ── 6. Emit src/fp/field-index.ts ─────────────────────────────────────────
const indexFile = `/**
 * Field-ownership index — GENERATED by scripts/gen-field-index.mjs. Do not edit.
 *
 * Maps a transaction field name to the set of transaction types that accept
 * it. \`assertKnownFields\` rejects a field only when it is listed here AND
 * absent for the transaction being built, so a field this library does not
 * model yet still passes. See Bug #11 in 173-xrpjson-testing.
 *
 * GENERATED FILE — run \`node scripts/gen-field-index.mjs\` after changing any
 * factory's props interface. \`field-index.assert.ts\` fails the build if this
 * table drifts from the interfaces it was generated from.
 *
 * Merged from this library's 79 props interfaces and the protocol's own
 * \`TRANSACTION_FORMATS\` table (ripple-binary-codec@${codecVersion}). The merge
 * can only widen a field's accepted-type set, never narrow it, so no
 * transaction that accepts a field today can start rejecting it.
 */
import { ValidationError } from '../errors.js';

/**
 * Fields valid on every transaction type, so they own no entry in
 * {@link FIELD_OWNERS}: such an entry would list all 79 types and could never
 * reject anything. Excluding them is what keeps the forward-compatibility hatch
 * working for them, and what makes the completeness assertion in
 * \`field-index.assert.ts\` usable.
 *
 * The union of the base fields every factory inherits and the codec's
 * \`TRANSACTION_FORMATS.common\` pseudo-type. The codec list carries fields this
 * library does not inherit — \`PreviousTxnID\`, \`OperationLimit\`, and
 * \`Sponsor\`/\`SponsorFlags\`/\`SponsorSignature\`, the last three of which
 * SponsorshipTransfer declares directly. Without them \`payment({ Sponsor })\`
 * would be rejected as a SponsorshipTransfer-only field.
 */
export const COMMON_FIELDS = [
${commonFields.map((f) => `  '${f}',`).join('\n')}
] as const;

/** One of the fields valid on every transaction type. */
export type CommonField = (typeof COMMON_FIELDS)[number];

/**
 * Transaction types that accept each field. Built from ${fieldCount} field
 * names (${pairCount} field/type pairs; ${singleType} fields valid on exactly
 * one type), unioned across the 79 \`XxxProps\` interfaces and the protocol's
 * \`TRANSACTION_FORMATS\`.
 *
 * Typed with \`satisfies\`, NOT \`Record<string, …>\`. A \`Record\` annotation
 * adds an index signature, which collapses \`keyof\` to \`string\` and silently
 * disarms the assertions in \`field-index.assert.ts\`.
 */
export const FIELD_OWNERS = {
${rows}
} satisfies Record<string, ReadonlySet<string>>;

/**
 * Reject a field that belongs to a different transaction type.
 *
 * A key with no entry in \`FIELD_OWNERS\` is a field the library does not model
 * yet — the forward-compatibility hatch at \`BaseTransactionFields\` — and is
 * allowed through. Only a key that is known AND wrong for this type is
 * refused, with the transaction that does accept it named in the message.
 *
 * @param txType - The transaction type literal being built.
 * @param field  - The prop key to check.
 * @throws {ValidationError} if \`field\` belongs to a different transaction.
 */
export function assertKnownFields(txType: string, field: string): void {
  // The lookup is deliberately widened: \`field\` is a runtime string that a
  // JavaScript caller controls, so it is not one of the table's literal keys.
  // A key that is not in the table at all resolves to undefined here, which is
  // the forward-compatibility case below.
  const owners = (FIELD_OWNERS as Readonly<Record<string, ReadonlySet<string>>>)[field];
  if (owners === undefined) return; // unmodelled field — forward-compat
  if (owners.has(txType)) return;   // correct transaction
  throw new ValidationError(
    \`\${txType}: "\${field}" is not a field on this transaction. \` +
      \`It belongs to: \${[...owners].sort().join(', ')}.\`,
  );
}
`;

writeFileSync(OUT_INDEX, indexFile);

// ── 7. Emit src/fp/field-index.assert.ts ──────────────────────────────────
/**
 * The Props union is emitted as `import type` statements rather than a
 * structural copy of the interfaces. That is the whole point: the imports
 * resolve against the live interfaces, so adding a field to one is what makes
 * the completeness assertion fire. A structural copy would be regenerated
 * from the same source in the same run and would check nothing.
 */
const sortedTxTypes = [...implTypes].sort();
const propsImports = sortedTxTypes
  .map((t) => propsOfTxType.get(t))
  .map(({ props, module }) => `import type { ${props} } from './factories/${module}.js';`)
  .join('\n');
const propsUnion = sortedTxTypes.map((t) => `  | ${propsOfTxType.get(t).props}`).join('\n');
const txTypeUnion = sortedTxTypes.map((t) => `  | '${t}'`).join('\n');
const protocolOnlyUnion =
  protocolOnlyFields.map((f) => `  | '${f}'`).join('\n') || '  never';
const methodUnion = METHOD_NAMES.map((m) => `'${m}'`).join(' | ');

const assertFile = `/**
 * Drift assertions for the generated field-ownership index.
 *
 * \`scripts/gen-field-index.mjs\` produces \`field-index.ts\` from the 79
 * \`XxxProps\` interfaces and the protocol's \`TRANSACTION_FORMATS\` table. Nothing
 * stops that table drifting from its source: someone adds a field to a props
 * interface and forgets to regenerate, and the index quietly stops knowing
 * where that field belongs.
 *
 * These assertions close that gap at COMPILE TIME rather than in CI. All three
 * are load-bearing, and all three are easy to accidentally disarm:
 *
 *   - \`FIELD_OWNERS\` is typed \`satisfies Record<string, ReadonlySet<string>>\`,
 *     never \`Record<string, ReadonlySet<string>>\`. A \`Record\` annotation adds
 *     an index signature, \`keyof\` collapses to \`string\`, and then:
 *       completeness  \`Exclude<AllFields, keyof>\` -> \`never\`  -> always passes
 *       key soundness \`Exclude<keyof, …>\`         -> \`string\` -> always fires
 *     The first is the dangerous one: the index could lose fields entirely and
 *     the build would stay green.
 *
 *   - \`keyof\` over a UNION yields the INTERSECTION of keys, not the union.
 *     \`UnionKeys\` distributes over the union to get every key. Without it,
 *     \`AllOwnedFields\` would contain only the fields common to all 79
 *     factories — \`Account\` and a handful — and completeness would be vacuous.
 *
 * The Props union below is a list of \`import type\` statements, not a copy of
 * the interfaces. Imports resolve against the live types, so an edit to a props
 * interface is what makes these assertions fire.
 *
 * Fields in \`COMMON_FIELDS\` are valid on every transaction, so they own no
 * index entry and are excluded from the completeness scope for the same reason
 * \`Fee\` never appears in a props interface body — it is inherited.
 */
import type { FIELD_OWNERS as Owners, CommonField } from './field-index.js';
/**
 * The three assertions below are written so the compiler NAMES the offender,
 * not just reports \`false\`. Each resolves to \`true\` when it holds, and to an
 * object type carrying the offending keys when it does not — so
 *
 *     error TS2322: Type '{ failingCheck: "COMPLETENESS"; offenders: "NewField" }'
 *
 * appears at the const that consumes it. A bare \`Assert<IsNever<…>>\` reports
 * only \`Type 'false' does not satisfy the constraint 'true'\`, which tells the
 * maintainer that *something* drifted but not what.
 */
${propsImports}

/** Distributes \`keyof\` over a union so it yields every key, not just shared ones. */
type UnionKeys<T> = T extends unknown ? keyof T : never;

/** Every one of the 79 factory props types. */
type AnyProps =
${propsUnion};

/** Every transaction type this library implements. */
type TxType =
${txTypeUnion};

/** Every non-common field name declared anywhere in the 79 props interfaces. */
type AllOwnedFields = Exclude<UnionKeys<AnyProps>, CommonField | ${methodUnion}>;

/** The element type of every owner set in the index. */
type SetElement<S> = S extends ReadonlySet<infer T> ? T : never;
type AllOwnerTxTypes = SetElement<(typeof Owners)[keyof typeof Owners]>;

/** Fields the protocol contributes that this library does not model. */
type ProtocolOnlyFields =
${protocolOnlyUnion};

type IsNever<T> = [T] extends [never] ? true : false;

/** \`true\` when \`Bad\` is \`never\`; otherwise an object naming its members. */
type Check<Bad extends string, Name extends string> =
  IsNever<Bad> extends true ? true : { failingCheck: Name; offenders: Bad };

/**
 * COMPLETENESS — every field declared in a props interface is in the index.
 * This is what makes the table self-maintaining: add a field to an interface
 * without regenerating, and the build fails naming that field.
 */
type Completeness = Check<
  Exclude<AllOwnedFields, keyof typeof Owners>,
  'COMPLETENESS'
>;

/**
 * TX-TYPE SOUNDNESS — every transaction named in the index is one this library
 * implements. A typo would make a field reject on every type, including the one
 * that should accept it.
 */
type TxTypes = Check<Exclude<AllOwnerTxTypes, TxType>, 'TX_TYPE_SOUNDNESS'>;

/**
 * KEY SOUNDNESS — every index key is either a field some props interface
 * declares or a field the protocol contributes. The protocol contributes
 * ${protocolOnlyFields.length} fields this library does not model
 * (${protocolOnlyFields.map((f) => `\`${f}\``).join(', ')}) — the entire point of
 * merging in protocol truth: those are real ledger fields, so using one on the
 * wrong transaction is caught even though this library has no interface for it.
 */
type IndexKeys = Check<
  Exclude<keyof typeof Owners, AllOwnedFields | ProtocolOnlyFields>,
  'KEY_SOUNDNESS'
>;

const _completeness: Completeness = true;
const _txTypes: TxTypes = true;
const _indexKeys: IndexKeys = true;

export { _completeness, _txTypes, _indexKeys };
`;

writeFileSync(OUT_ASSERT, assertFile);

// ── 8. Console summary ────────────────────────────────────────────────────
console.log(`codec       : ripple-binary-codec@${codecVersion}`);
console.log(`defs source : ${DEFS_PATH.replace(`${ROOT}/`, '')}`);
console.log(`factories   : ${factories.length}`);
console.log('');
console.log(`field names : ${fieldCount}  (${ownFieldSet.size} ours + ${protocolOnlyFields.length} protocol-only)`);
console.log(`field/type  : ${pairCount}`);
console.log(`single-type : ${singleType}`);
console.log(`common      : ${commonFields.length} excluded (valid on every type)`);
console.log(`types       : ${implTypes.size} implemented, ${implTypes.size - unrepresented.length} represented`);

if (unrepresented.length) {
  const suspect = unrepresented.filter((t) => (ownFieldsByType.get(t) ?? []).length > 0);
  const expected = unrepresented
    .filter((t) => (ownFieldsByType.get(t) ?? []).length === 0)
    .map((t) => `${t} (declares only base fields)`);
  if (expected.length) console.log(`no rows     : ${expected.join('; ')}`);
  if (suspect.length) {
    throw new Error(
      `types with own fields but no index row: ${suspect.join(', ')} — the ` +
        'index would silently reject fields on transactions it does not model.',
    );
  }
}

console.log('');
console.log('--- protocol-only fields (new catch surface) ---');
for (const f of protocolOnlyFields) {
  console.log(`  ${f}: ${[...owners.get(f)].sort().join(', ')}`);
}

console.log('');
console.log('--- divergences (merged, not resolved) ---');
if (divergences.length === 0) console.log('  none');
for (const d of divergences) {
  if (d.weOnly.length) console.log(`  ${d.txType}: modelled here only -> ${d.weOnly.join(', ')}`);
  if (d.protoOnly.length) console.log(`  ${d.txType}: protocol-only       -> ${d.protoOnly.join(', ')}`);
}

console.log('');
console.log(`wrote       : ${OUT_INDEX.replace(`${ROOT}/`, '')}`);
console.log(`wrote       : ${OUT_ASSERT.replace(`${ROOT}/`, '')}`);