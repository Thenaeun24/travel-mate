import { useEffect, useState } from 'react';
import { HOME_CURRENCY } from '../constants/currencies';

// Fetches live exchange rates for `baseCurrency` against all other currencies.
// `rates[X]` means: 1 baseCurrency = rates[X] of X.
// Returns helpers to convert any amount into the base currency or into KRW.
export const useExchangeRates = (baseCurrency) => {
  const [rates, setRates] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!baseCurrency) return;
    let cancelled = false;
    setLoading(true);
    fetch(`https://open.er-api.com/v6/latest/${baseCurrency}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setRates(data?.rates || null);
      })
      .catch(() => {
        if (!cancelled) setRates(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [baseCurrency]);

  // base → KRW rate (1 base = rateToKRW won)
  const rateToKRW = rates?.[HOME_CURRENCY] ?? null;

  // Convert an amount in `currency` into the base currency.
  const toBase = (amount, currency) => {
    const amt = Number(amount || 0);
    if (currency === baseCurrency) return amt;
    if (!rates || !rates[currency]) return amt;
    return amt / rates[currency];
  };

  const toKRW = (amountBase) => {
    if (rateToKRW == null) return null;
    return Math.round(Number(amountBase || 0) * rateToKRW);
  };

  return { rates, loading, rateToKRW, toBase, toKRW };
};
