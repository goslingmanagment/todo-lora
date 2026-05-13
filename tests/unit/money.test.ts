import { describe, expect, it } from 'vitest';
import { formatDollars, formatMoneyDisplay, pendingFromTask } from '@/lib/format/money';

describe('formatDollars', () => {
  it('renders integer dollars without decimals', () => {
    expect(formatDollars(10000)).toBe('$100');
    expect(formatDollars(23000)).toBe('$230');
  });

  it('renders fractional cents with two decimals', () => {
    expect(formatDollars(10050)).toBe('$100.50');
    expect(formatDollars(99)).toBe('$0.99');
  });
});

describe('formatMoneyDisplay (§6.5)', () => {
  it('full payment shows collected / total while money is still outstanding', () => {
    expect(
      formatMoneyDisplay({ paymentModel: 'full', amountCents: 10000, amountCollectedCents: 5000 }),
    ).toBe('$50 / $100');
    expect(
      formatMoneyDisplay({ paymentModel: 'full', amountCents: 25000, amountCollectedCents: 0 }),
    ).toBe('$0 / $250');
  });

  it('full payment shows total only once fully collected or collection is unknown', () => {
    expect(
      formatMoneyDisplay({ paymentModel: 'full', amountCents: 10000, amountCollectedCents: 10000 }),
    ).toBe('$100');
    expect(
      formatMoneyDisplay({ paymentModel: 'full', amountCents: 25000, amountCollectedCents: null }),
    ).toBe('$250');
  });

  it('unlock partial shows collected / total · unlock', () => {
    expect(
      formatMoneyDisplay({ paymentModel: 'unlock', amountCents: 18000, amountCollectedCents: 9000 }),
    ).toBe('$90 / $180 · unlock');
  });

  it('unlock complete shows total · unlock', () => {
    expect(
      formatMoneyDisplay({ paymentModel: 'unlock', amountCents: 18000, amountCollectedCents: 18000 }),
    ).toBe('$180 · unlock');
    expect(
      formatMoneyDisplay({ paymentModel: 'unlock', amountCents: 18000, amountCollectedCents: null }),
    ).toBe('$180 · unlock');
  });

  it('returns null when amount is unknown', () => {
    expect(
      formatMoneyDisplay({ paymentModel: 'full', amountCents: null, amountCollectedCents: null }),
    ).toBeNull();
  });
});

describe('pendingFromTask', () => {
  it('reports outstanding cents', () => {
    expect(
      pendingFromTask({ paymentModel: 'unlock', amountCents: 18000, amountCollectedCents: 7500 }),
    ).toEqual({ collected: 7500, outstanding: 10500, total: 18000 });
  });

  it('handles overcollection by clamping to zero', () => {
    expect(
      pendingFromTask({ paymentModel: 'full', amountCents: 1000, amountCollectedCents: 5000 }),
    ).toEqual({ collected: 5000, outstanding: 0, total: 1000 });
  });
});
