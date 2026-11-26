// Amounts of other coins (paid through Relay), shortened for reading and copying.

/**
 * The amount to send, shortened for reading and copying. Rounded *up* (never down): Relay delivers
 * the exact GRAM only for at least the quoted amount, and returns anything over.
 */
export function trimAmt(s: string, coin?: string) {
  const max = coin === 'BTC' ? 8 : 6;
  const [i, f = ''] = s.split('.');
  if (f.length <= max) return f.replace(/0+$/, '') ? `${i}.${f.replace(/0+$/, '')}` : i;
  const units = BigInt(i + f.slice(0, max)) + (/[1-9]/.test(f.slice(max)) ? 1n : 0n);
  const t = units.toString().padStart(max + 1, '0');
  const whole = t.slice(0, -max), frac = t.slice(-max).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}
