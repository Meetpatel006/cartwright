import { describe, expect, test } from "bun:test";

import { releaseWalletReservation, reserveWallet, settleWalletReservation } from "./wallet-ledger";

const wallet = { currency: "INR", walletCurrency: "INR", walletBalanceInMinor: 150_000 };

describe("wallet ledger", () => {
  test("reserves capacity and releases it when a payment does not happen", () => {
    const first = reserveWallet({ ...wallet, amountInMinor: 100_000 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.remainingInMinor).toBe(50_000);

    const blocked = reserveWallet({ ...wallet, amountInMinor: 60_000 });
    expect(blocked.ok).toBe(false);
    releaseWalletReservation(first.reservationId);

    const availableAgain = reserveWallet({ ...wallet, amountInMinor: 60_000 });
    expect(availableAgain.ok).toBe(true);
    if (availableAgain.ok) releaseWalletReservation(availableAgain.reservationId);
  });

  test("settled reservations remain consumed", () => {
    const reservation = reserveWallet({ ...wallet, amountInMinor: 100_000 });
    expect(reservation.ok).toBe(true);
    if (!reservation.ok) return;
    settleWalletReservation(reservation.reservationId);
    expect(reserveWallet({ ...wallet, amountInMinor: 60_000 }).ok).toBe(false);
  });
});
