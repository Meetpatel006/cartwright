import { randomUUID } from "node:crypto";

interface WalletReservation {
  id: string;
  amountInMinor: number;
  currency: string;
  state: "reserved" | "settled";
  createdAt: number;
}

const reservations = new Map<string, WalletReservation>();
const sessionReservations = new Map<string, string>();

export function reserveWallet(input: {
  amountInMinor: number;
  currency: string;
  walletBalanceInMinor: number;
  walletCurrency: string;
}): { ok: true; reservationId: string; remainingInMinor: number } | { ok: false; reason: string } {
  const currency = input.currency.toUpperCase();
  const walletCurrency = input.walletCurrency.toUpperCase();
  if (currency !== walletCurrency) return { ok: false, reason: `Wallet currency ${walletCurrency} cannot authorize ${currency}.` };

  const committedOrHeld = [...reservations.values()]
    .filter((reservation) => reservation.currency === currency)
    .reduce((total, reservation) => total + reservation.amountInMinor, 0);
  const remainingInMinor = input.walletBalanceInMinor - committedOrHeld;
  if (input.amountInMinor > remainingInMinor) {
    return { ok: false, reason: "Payment exceeds the remaining wallet spending balance." };
  }

  const reservationId = `wallet-${randomUUID()}`;
  reservations.set(reservationId, {
    id: reservationId,
    amountInMinor: input.amountInMinor,
    currency,
    state: "reserved",
    createdAt: Date.now(),
  });
  return { ok: true, reservationId, remainingInMinor: remainingInMinor - input.amountInMinor };
}

export function bindWalletReservation(sessionId: string, reservationId: string): void {
  sessionReservations.set(sessionId, reservationId);
}

export function releaseWalletReservation(reservationId: string | undefined): void {
  if (!reservationId) return;
  reservations.delete(reservationId);
  for (const [sessionId, boundId] of sessionReservations) {
    if (boundId === reservationId) sessionReservations.delete(sessionId);
  }
}

export function settleWalletReservation(reservationId: string | undefined): void {
  if (!reservationId) return;
  const reservation = reservations.get(reservationId);
  if (reservation) reservation.state = "settled";
}

export function reservationForSession(sessionId: string): string | undefined {
  return sessionReservations.get(sessionId);
}

/** Release abandoned reservations in the local/test process. */
export function releaseExpiredWalletReservations(maxAgeMs = 15 * 60_000): void {
  const now = Date.now();
  for (const reservation of reservations.values()) {
    if (now - reservation.createdAt > maxAgeMs) releaseWalletReservation(reservation.id);
  }
}
