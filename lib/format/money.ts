/**
 * Money formatting per §6.5.
 * USD only. `$` prefix. Integer dollars when value is whole, otherwise 2 decimals.
 */

export function formatDollars(cents: number): string {
  if (!Number.isFinite(cents)) return '$0';
  const whole = Math.trunc(cents / 100);
  const fraction = Math.abs(cents % 100);
  if (fraction === 0) return `$${whole.toLocaleString('en-US')}`;
  return `$${whole.toLocaleString('en-US')}.${fraction.toString().padStart(2, '0')}`;
}

export type MoneyDisplayInput = {
  paymentModel: 'full' | 'unlock' | null | undefined;
  amountCents: number | null | undefined;
  amountCollectedCents: number | null | undefined;
};

export function formatMoneyDisplay(input: MoneyDisplayInput): string | null {
  const { paymentModel, amountCents, amountCollectedCents } = input;
  if (amountCents == null) return null;
  if (amountCollectedCents != null && amountCollectedCents < amountCents) {
    const prefix = `${formatDollars(amountCollectedCents)} / ${formatDollars(amountCents)}`;
    return paymentModel === 'unlock' ? `${prefix} · unlock` : prefix;
  }
  if (paymentModel === 'unlock') {
    return `${formatDollars(amountCents)} · unlock`;
  }
  // 'full' or unspecified
  return formatDollars(amountCents);
}

export type PendingMoney = { collected: number; outstanding: number; total: number };

export function pendingFromTask(input: MoneyDisplayInput): PendingMoney {
  const total = input.amountCents ?? 0;
  const collected = input.amountCollectedCents ?? 0;
  const outstanding = Math.max(0, total - collected);
  return { collected, outstanding, total };
}
