import { describe, expect, it } from "vitest";
import {
  descriptionLooksLikeTransfer,
  findTransferPairs,
  isTransferPair,
  type PairableTransaction,
} from "./transfers";

const txn = (overrides: Partial<PairableTransaction>): PairableTransaction => ({
  id: "t1",
  amountCents: -50000,
  transactionDate: "2026-04-15",
  description: "TRANSFER TO SAVINGS",
  accountId: "acct-checking",
  ...overrides,
});

describe("descriptionLooksLikeTransfer", () => {
  it.each([
    "TRANSFER TO SAVINGS",
    "Internal transfer",
    "CBA CC PAYMENT",
    "BPAY 12345",
    "Direct Credit ACME",
    "Credit card payment",
  ])("matches: %s", (desc) => {
    expect(descriptionLooksLikeTransfer(desc)).toBe(true);
  });

  it.each(["WOOLWORTHS NEWTOWN", "TOBYS ESTATE COFFEE", "ACME PTY LTD SALARY"])(
    "does not match: %s",
    (desc) => {
      expect(descriptionLooksLikeTransfer(desc)).toBe(false);
    },
  );
});

describe("isTransferPair", () => {
  it("pairs mirror-image debit and credit across accounts with transfer description", () => {
    const a = txn({ id: "a", amountCents: -50000, accountId: "checking" });
    const b = txn({
      id: "b",
      amountCents: 50000,
      accountId: "savings",
      description: "TRANSFER FROM CHECKING",
    });
    expect(isTransferPair(a, b)).toBe(true);
  });

  it("rejects mirror amounts on the same account", () => {
    const a = txn({ id: "a", amountCents: -50000, accountId: "checking" });
    const b = txn({ id: "b", amountCents: 50000, accountId: "checking" });
    expect(isTransferPair(a, b)).toBe(false);
  });

  it("rejects mirror amounts that don't read like transfers", () => {
    const a = txn({
      id: "a",
      amountCents: -2500,
      description: "WOOLWORTHS NEWTOWN",
      accountId: "checking",
    });
    const b = txn({
      id: "b",
      amountCents: 2500,
      description: "REFUND WOOLWORTHS",
      accountId: "credit-card",
    });
    expect(isTransferPair(a, b)).toBe(false);
  });

  it("accepts when only one side has a transfer description", () => {
    const a = txn({
      id: "a",
      amountCents: -120000,
      accountId: "checking",
      description: "CBA CC PAYMENT",
    });
    const b = txn({
      id: "b",
      amountCents: 120000,
      accountId: "credit-card",
      description: "PAYMENT THANK YOU",
    });
    expect(isTransferPair(a, b)).toBe(true);
  });

  it("rejects pairs more than the window of days apart", () => {
    const a = txn({ id: "a", transactionDate: "2026-04-10" });
    const b = txn({
      id: "b",
      amountCents: 50000,
      accountId: "savings",
      transactionDate: "2026-04-15",
      description: "TRANSFER FROM CHECKING",
    });
    expect(isTransferPair(a, b)).toBe(false);
  });

  it("accepts pairs within the default ±2 day window", () => {
    const a = txn({ id: "a", transactionDate: "2026-04-13" });
    const b = txn({
      id: "b",
      amountCents: 50000,
      accountId: "savings",
      transactionDate: "2026-04-15",
      description: "TRANSFER FROM CHECKING",
    });
    expect(isTransferPair(a, b)).toBe(true);
  });

  it("rejects same-sign amounts", () => {
    const a = txn({ id: "a", amountCents: -50000 });
    const b = txn({ id: "b", amountCents: -50000, accountId: "savings" });
    expect(isTransferPair(a, b)).toBe(false);
  });

  it("rejects different magnitudes", () => {
    const a = txn({ id: "a", amountCents: -50000 });
    const b = txn({
      id: "b",
      amountCents: 49900,
      accountId: "savings",
      description: "TRANSFER FROM CHECKING",
    });
    expect(isTransferPair(a, b)).toBe(false);
  });

  it("rejects zero-amount transactions", () => {
    const a = txn({ id: "a", amountCents: 0 });
    const b = txn({ id: "b", amountCents: 0, accountId: "savings" });
    expect(isTransferPair(a, b)).toBe(false);
  });
});

describe("findTransferPairs", () => {
  it("pairs the legs of a single transfer and leaves unrelated txns alone", () => {
    const txns = [
      txn({ id: "groceries", amountCents: -2500, description: "WOOLWORTHS", accountId: "c" }),
      txn({
        id: "transfer-out",
        amountCents: -50000,
        description: "TRANSFER TO SAVINGS",
        accountId: "c",
      }),
      txn({
        id: "transfer-in",
        amountCents: 50000,
        description: "TRANSFER FROM CHECKING",
        accountId: "s",
      }),
      txn({ id: "salary", amountCents: 450000, description: "ACME PTY LTD SALARY", accountId: "c" }),
    ];

    const result = findTransferPairs(txns);
    expect(result).toEqual(new Set(["transfer-out", "transfer-in"]));
  });

  it("greedily pairs the first viable match when two candidates exist", () => {
    const txns = [
      txn({
        id: "out-1",
        amountCents: -50000,
        description: "TRANSFER OUT",
        accountId: "c",
        transactionDate: "2026-04-15",
      }),
      txn({
        id: "in-1",
        amountCents: 50000,
        description: "TRANSFER IN",
        accountId: "s",
        transactionDate: "2026-04-15",
      }),
      txn({
        id: "in-2",
        amountCents: 50000,
        description: "TRANSFER IN",
        accountId: "s",
        transactionDate: "2026-04-16",
      }),
    ];

    const result = findTransferPairs(txns);
    // out-1 pairs with in-1 (the first match); in-2 stays unpaired.
    expect(result).toEqual(new Set(["out-1", "in-1"]));
  });

  it("returns empty set when nothing pairs", () => {
    expect(
      findTransferPairs([
        txn({ id: "a", amountCents: -2500, description: "WOOLWORTHS" }),
        txn({ id: "b", amountCents: -1500, description: "COLES" }),
      ]),
    ).toEqual(new Set());
  });
});
