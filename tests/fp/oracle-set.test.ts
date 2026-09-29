/**
 * Tests for the functional OracleSet factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, OracleDocumentID,
 *      LastUpdateTime, PriceDataSeries).
 *   2. Optional field handling (Provider, URI, AssetClass, Flags,
 *      Fee, Sequence).
 *   3. Spec-mandated guards the class API omits:
 *        a. PriceDataSeries capped at 10 elements (XLS-47).
 *        b. Each element has exactly one key `PriceData` (xrpl.js 5.3.0).
 *        c. AssetPrice ↔ Scale pairing (xrpl.js 5.3.0).
 *        d. Scale in [0, 10] (xrpl.js 5.3.0).
 *        e. AssetPrice accepts number OR hex string 1-16 chars.
 *        f. Provider / URI / AssetClass hex-encoded printable ASCII
 *           with byte-length caps (XLS-47).
 *   4. Field-name divergence: factory omits the class's
 *      non-spec `AssetBase` / `AssetQuote` and includes the spec's
 *      `AssetClass`.
 *   5. Frozen-shape contract (mutation throws, .with() returns a new
 *      frozen tx, .toJSON() strips methods and undefined fields).
 */
import { describe, it, expect } from 'vitest';
import { oracleSet } from '../../src/fp/factories/oracle-set.js';

const OWNER = 'rsA2LpzuawewSBQXkiju3YQTMzW13pAAdW';
const DOC_ID = 34;
const UPDATE_TIME = 743609014;

// Single spec-conformant PriceDataSeries entry (XRP/USD).
const PRICE_SERIES = [
  {
    PriceData: {
      BaseAsset: 'XRP',
      QuoteAsset: 'USD',
      AssetPrice: 740,
      Scale: 3,
    },
  },
];

function make(extras: Record<string, unknown> = {}) {
  return oracleSet({
    Account: OWNER,
    OracleDocumentID: DOC_ID,
    LastUpdateTime: UPDATE_TIME,
    PriceDataSeries: PRICE_SERIES,
    ...extras,
  });
}

describe('fp/oracleSet()', () => {
  describe('construction', () => {
    it('constructs with the four required fields', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('OracleSet');
      expect(tx.Account).toBe(OWNER);
      expect(tx.OracleDocumentID).toBe(DOC_ID);
      expect(tx.LastUpdateTime).toBe(UPDATE_TIME);
      expect(tx.PriceDataSeries).toEqual(PRICE_SERIES);
    });

    it('accepts all spec fields plus Flags / Fee / Sequence', () => {
      const tx = oracleSet({
        Account: OWNER,
        OracleDocumentID: DOC_ID,
        LastUpdateTime: UPDATE_TIME,
        PriceDataSeries: PRICE_SERIES,
        Provider: '70726F7669646572', // "provider"
        URI: '68747470733A2F2F6578616D706C652E636F6D', // "https://example.com"
        AssetClass: '63757272656E6379', // "currency"
        Flags: 0,
        Fee: '12',
        Sequence: 8,
      });
      expect(tx.Provider).toBe('70726F7669646572');
      expect(tx.URI).toBe('68747470733A2F2F6578616D706C652E636F6D');
      expect(tx.AssetClass).toBe('63757272656E6379');
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(8);
    });

    it('does NOT expose the class-only non-spec fields AssetBase / AssetQuote', () => {
      const tx = make();
      expect('AssetBase' in tx).toBe(false);
      expect('AssetQuote' in tx).toBe(false);
    });
  });

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        oracleSet({
          Account: '' as never,
          OracleDocumentID: DOC_ID,
          LastUpdateTime: UPDATE_TIME,
          PriceDataSeries: PRICE_SERIES,
        }),
      ).toThrow(/Account/);
    });
  });

  describe('OracleDocumentID validation', () => {
    it('throws on non-integer OracleDocumentID', () => {
      expect(() =>
        oracleSet({
          Account: OWNER,
          OracleDocumentID: 1.5,
          LastUpdateTime: UPDATE_TIME,
          PriceDataSeries: PRICE_SERIES,
        }),
      ).toThrow(/OracleDocumentID/);
    });

    it('throws on negative OracleDocumentID', () => {
      expect(() =>
        oracleSet({
          Account: OWNER,
          OracleDocumentID: -1,
          LastUpdateTime: UPDATE_TIME,
          PriceDataSeries: PRICE_SERIES,
        }),
      ).toThrow(/OracleDocumentID/);
    });

    it('throws on OracleDocumentID > UINT32', () => {
      expect(() =>
        oracleSet({
          Account: OWNER,
          OracleDocumentID: 0x1_0000_0000,
          LastUpdateTime: UPDATE_TIME,
          PriceDataSeries: PRICE_SERIES,
        }),
      ).toThrow(/UINT32/);
    });

    it('accepts OracleDocumentID at UINT32 boundary', () => {
      const tx = oracleSet({
        Account: OWNER,
        OracleDocumentID: 0xffffffff,
        LastUpdateTime: UPDATE_TIME,
        PriceDataSeries: PRICE_SERIES,
      });
      expect(tx.OracleDocumentID).toBe(0xffffffff);
    });

    it('accepts OracleDocumentID = 0', () => {
      const tx = oracleSet({
        Account: OWNER,
        OracleDocumentID: 0,
        LastUpdateTime: UPDATE_TIME,
        PriceDataSeries: PRICE_SERIES,
      });
      expect(tx.OracleDocumentID).toBe(0);
    });
  });

  describe('LastUpdateTime validation', () => {
    it('throws on non-integer LastUpdateTime', () => {
      expect(() =>
        oracleSet({
          Account: OWNER,
          OracleDocumentID: DOC_ID,
          LastUpdateTime: 1.5,
          PriceDataSeries: PRICE_SERIES,
        }),
      ).toThrow(/LastUpdateTime/);
    });

    it('throws on negative LastUpdateTime', () => {
      expect(() =>
        oracleSet({
          Account: OWNER,
          OracleDocumentID: DOC_ID,
          LastUpdateTime: -1,
          PriceDataSeries: PRICE_SERIES,
        }),
      ).toThrow(/LastUpdateTime/);
    });

    it('throws on LastUpdateTime > UINT32', () => {
      expect(() =>
        oracleSet({
          Account: OWNER,
          OracleDocumentID: DOC_ID,
          LastUpdateTime: 0x1_0000_0000,
          PriceDataSeries: PRICE_SERIES,
        }),
      ).toThrow(/UINT32/);
    });
  });

  describe('PriceDataSeries validation', () => {
    it('throws on empty PriceDataSeries', () => {
      expect(() =>
        oracleSet({
          Account: OWNER,
          OracleDocumentID: DOC_ID,
          LastUpdateTime: UPDATE_TIME,
          PriceDataSeries: [],
        }),
      ).toThrow(/at least one/);
    });

    it('throws when PriceDataSeries exceeds 10 elements (XLS-47 cap)', () => {
      const big = Array.from({ length: 11 }, () => PRICE_SERIES[0]);
      expect(() =>
        oracleSet({
          Account: OWNER,
          OracleDocumentID: DOC_ID,
          LastUpdateTime: UPDATE_TIME,
          PriceDataSeries: big,
        }),
      ).toThrow(/at most 10/);
    });

    it('accepts PriceDataSeries at exactly 10 elements', () => {
      const ten = Array.from({ length: 10 }, () => PRICE_SERIES[0]);
      const tx = oracleSet({
        Account: OWNER,
        OracleDocumentID: DOC_ID,
        LastUpdateTime: UPDATE_TIME,
        PriceDataSeries: ten,
      });
      expect(tx.PriceDataSeries).toHaveLength(10);
    });

    it('throws when an element is missing the PriceData wrapper (xrpl.js single-key check)', () => {
      expect(() =>
        oracleSet({
          Account: OWNER,
          OracleDocumentID: DOC_ID,
          LastUpdateTime: UPDATE_TIME,
          PriceDataSeries: [{ BaseAsset: 'XRP', QuoteAsset: 'USD' } as never],
        }),
      ).toThrow(/PriceData/);
    });

    it('throws when an element has extra keys alongside PriceData (xrpl.js single-key check)', () => {
      expect(() =>
        oracleSet({
          Account: OWNER,
          OracleDocumentID: DOC_ID,
          LastUpdateTime: UPDATE_TIME,
          PriceDataSeries: [
            {
              PriceData: PRICE_SERIES[0]?.PriceData,
              Extra: 'x',
            } as never,
          ],
        }),
      ).toThrow(/single/);
    });

    it('throws when BaseAsset is missing', () => {
      expect(() =>
        oracleSet({
          Account: OWNER,
          OracleDocumentID: DOC_ID,
          LastUpdateTime: UPDATE_TIME,
          PriceDataSeries: [
            {
              PriceData: {
                QuoteAsset: 'USD',
                AssetPrice: 740,
                Scale: 3,
              } as never,
            },
          ],
        }),
      ).toThrow(/BaseAsset/);
    });

    it('throws when QuoteAsset is missing', () => {
      expect(() =>
        oracleSet({
          Account: OWNER,
          OracleDocumentID: DOC_ID,
          LastUpdateTime: UPDATE_TIME,
          PriceDataSeries: [
            {
              PriceData: {
                BaseAsset: 'XRP',
                AssetPrice: 740,
                Scale: 3,
              } as never,
            },
          ],
        }),
      ).toThrow(/QuoteAsset/);
    });

    it('accepts a PriceData entry with no AssetPrice and no Scale', () => {
      const tx = oracleSet({
        Account: OWNER,
        OracleDocumentID: DOC_ID,
        LastUpdateTime: UPDATE_TIME,
        PriceDataSeries: [
          { PriceData: { BaseAsset: 'XRP', QuoteAsset: 'USD' } },
        ],
      });
      const [entry] = tx.PriceDataSeries;
      expect(entry?.PriceData.AssetPrice).toBeUndefined();
      expect(entry?.PriceData.Scale).toBeUndefined();
    });

    it('accepts AssetPrice as a hex string of length 1-16', () => {
      const tx = oracleSet({
        Account: OWNER,
        OracleDocumentID: DOC_ID,
        LastUpdateTime: UPDATE_TIME,
        PriceDataSeries: [
          {
            PriceData: {
              BaseAsset: 'XRP',
              QuoteAsset: 'USD',
              AssetPrice: '2E4', // 740 decimal
              Scale: 3,
            },
          },
        ],
      });
      const [entry] = tx.PriceDataSeries;
      expect(entry?.PriceData.AssetPrice).toBe('2E4');
    });

    it('throws on AssetPrice hex string exceeding 16 chars', () => {
      const tooLong = 'F'.repeat(34); // 17 hex chars
      expect(() =>
        oracleSet({
          Account: OWNER,
          OracleDocumentID: DOC_ID,
          LastUpdateTime: UPDATE_TIME,
          PriceDataSeries: [
            {
              PriceData: {
                BaseAsset: 'XRP',
                QuoteAsset: 'USD',
                AssetPrice: tooLong,
                Scale: 3,
              },
            },
          ],
        }),
      ).toThrow(/AssetPrice/);
    });

    it('throws on AssetPrice as a non-hex, non-numeric string', () => {
      expect(() =>
        oracleSet({
          Account: OWNER,
          OracleDocumentID: DOC_ID,
          LastUpdateTime: UPDATE_TIME,
          PriceDataSeries: [
            {
              PriceData: {
                BaseAsset: 'XRP',
                QuoteAsset: 'USD',
                AssetPrice: 'not-hex',
                Scale: 3,
              },
            },
          ],
        }),
      ).toThrow(/AssetPrice/);
    });
  });

  describe('AssetPrice ↔ Scale pairing', () => {
    it('throws when only AssetPrice is provided (xrpl.js pairing rule)', () => {
      expect(() =>
        oracleSet({
          Account: OWNER,
          OracleDocumentID: DOC_ID,
          LastUpdateTime: UPDATE_TIME,
          PriceDataSeries: [
            {
              PriceData: {
                BaseAsset: 'XRP',
                QuoteAsset: 'USD',
                AssetPrice: 740,
              } as never,
            },
          ],
        }),
      ).toThrow(/both AssetPrice and Scale/);
    });

    it('throws when only Scale is provided (xrpl.js pairing rule)', () => {
      expect(() =>
        oracleSet({
          Account: OWNER,
          OracleDocumentID: DOC_ID,
          LastUpdateTime: UPDATE_TIME,
          PriceDataSeries: [
            {
              PriceData: {
                BaseAsset: 'XRP',
                QuoteAsset: 'USD',
                Scale: 3,
              } as never,
            },
          ],
        }),
      ).toThrow(/both AssetPrice and Scale/);
    });
  });

  describe('Scale range', () => {
    it('throws on Scale < 0', () => {
      expect(() =>
        oracleSet({
          Account: OWNER,
          OracleDocumentID: DOC_ID,
          LastUpdateTime: UPDATE_TIME,
          PriceDataSeries: [
            {
              PriceData: {
                BaseAsset: 'XRP',
                QuoteAsset: 'USD',
                AssetPrice: 740,
                Scale: -1,
              },
            },
          ],
        }),
      ).toThrow(/Scale/);
    });

    it('throws on Scale > 10 (xrpl.js uint8 cap)', () => {
      expect(() =>
        oracleSet({
          Account: OWNER,
          OracleDocumentID: DOC_ID,
          LastUpdateTime: UPDATE_TIME,
          PriceDataSeries: [
            {
              PriceData: {
                BaseAsset: 'XRP',
                QuoteAsset: 'USD',
                AssetPrice: 740,
                Scale: 11,
              },
            },
          ],
        }),
      ).toThrow(/Scale/);
    });

    it('throws on non-integer Scale', () => {
      expect(() =>
        oracleSet({
          Account: OWNER,
          OracleDocumentID: DOC_ID,
          LastUpdateTime: UPDATE_TIME,
          PriceDataSeries: [
            {
              PriceData: {
                BaseAsset: 'XRP',
                QuoteAsset: 'USD',
                AssetPrice: 740,
                Scale: 1.5,
              },
            },
          ],
        }),
      ).toThrow(/Scale/);
    });

    it('accepts Scale=0 (lower bound)', () => {
      const tx = oracleSet({
        Account: OWNER,
        OracleDocumentID: DOC_ID,
        LastUpdateTime: UPDATE_TIME,
        PriceDataSeries: [
          {
            PriceData: {
              BaseAsset: 'XRP',
              QuoteAsset: 'USD',
              AssetPrice: 740,
              Scale: 0,
            },
          },
        ],
      });
      const [entry] = tx.PriceDataSeries;
      expect(entry?.PriceData.Scale).toBe(0);
    });

    it('accepts Scale=10 (upper bound)', () => {
      const tx = oracleSet({
        Account: OWNER,
        OracleDocumentID: DOC_ID,
        LastUpdateTime: UPDATE_TIME,
        PriceDataSeries: [
          {
            PriceData: {
              BaseAsset: 'XRP',
              QuoteAsset: 'USD',
              AssetPrice: 740,
              Scale: 10,
            },
          },
        ],
      });
      const [entry] = tx.PriceDataSeries;
      expect(entry?.PriceData.Scale).toBe(10);
    });
  });

  describe('Provider / URI / AssetClass blob validation', () => {
    it('throws on non-hex Provider', () => {
      expect(() => make({ Provider: 'not-hex!' })).toThrow(/Provider/);
    });

    it('throws on odd-length Provider hex', () => {
      expect(() => make({ Provider: 'ABC' })).toThrow(/Provider/);
    });

    it('throws on Provider > 256 bytes', () => {
      const huge = 'A'.repeat(514); // 257 bytes
      expect(() => make({ Provider: huge })).toThrow(/Provider/);
    });

    it('throws when Provider decodes to a non-printable-ASCII byte', () => {
      // 0x00 is NUL — outside the 0x20..0x7E range.
      expect(() => make({ Provider: '00FF' })).toThrow(/printable ASCII/);
    });

    it('accepts Provider at exactly 256 bytes', () => {
      const ok = '7E'.repeat(256); // 256 bytes, all '~'
      const tx = make({ Provider: ok });
      expect(tx.Provider).toBe(ok);
    });

    it('throws on URI > 256 bytes', () => {
      const huge = 'A'.repeat(514);
      expect(() => make({ URI: huge })).toThrow(/URI/);
    });

    it('accepts URI at exactly 256 bytes', () => {
      const ok = '20'.repeat(256); // 256 bytes, all spaces
      const tx = make({ URI: ok });
      expect(tx.URI).toBe(ok);
    });

    it('throws on AssetClass > 16 bytes', () => {
      const huge = 'A'.repeat(34); // 17 bytes
      expect(() => make({ AssetClass: huge })).toThrow(/AssetClass/);
    });

    it('accepts AssetClass at exactly 16 bytes', () => {
      const ok = '63'.repeat(16); // 16 bytes, all 'c'
      const tx = make({ AssetClass: ok });
      expect(tx.AssetClass).toBe(ok);
    });

    it('throws when AssetClass decodes to non-printable-ASCII', () => {
      expect(() => make({ AssetClass: '1F' })).toThrow(/printable ASCII/);
    });
  });

  describe('frozen-shape contract', () => {
    it('returns a frozen object', () => {
      const tx = make();
      expect(Object.isFrozen(tx)).toBe(true);
    });

    it('mutation throws in strict mode', () => {
      const tx = make();
      expect(() => {
        (tx as unknown as Record<string, unknown>).OracleDocumentID = 999;
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides applied', () => {
      const tx = make();
      const tx2 = tx.with({ OracleDocumentID: 99 });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.OracleDocumentID).toBe(99);
      expect(tx.OracleDocumentID).toBe(DOC_ID);
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      expect(() => tx.with({ OracleDocumentID: -5 })).toThrow(/OracleDocumentID/);
      expect(() => tx.with({ LastUpdateTime: 'soon' as never })).toThrow(
        /LastUpdateTime/,
      );
      expect(() => tx.with({ PriceDataSeries: [] as never })).toThrow(
        /at least one/,
      );
      expect(() =>
        tx.with({ Provider: 'not-hex' }),
      ).toThrow(/Provider/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = oracleSet({
        Account: OWNER,
        OracleDocumentID: DOC_ID,
        LastUpdateTime: UPDATE_TIME,
        PriceDataSeries: PRICE_SERIES,
        Provider: '70726F7669646572',
        AssetClass: '63757272656E6379',
        Fee: '12',
      });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'OracleSet',
        Account: OWNER,
        OracleDocumentID: DOC_ID,
        LastUpdateTime: UPDATE_TIME,
        PriceDataSeries: PRICE_SERIES,
        Provider: '70726F7669646572',
        AssetClass: '63757272656E6379',
        Fee: '12',
      });
    });

    it('.toJSON() skips undefined fields and methods', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('validate' in json).toBe(false);
      expect('toJSON' in json).toBe(false);
      expect('with' in json).toBe(false);
      expect('Provider' in json).toBe(false);
      expect('URI' in json).toBe(false);
      expect('AssetClass' in json).toBe(false);
      expect('Flags' in json).toBe(false);
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
    });

    it('.validate() is a no-op after construction', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });
});
