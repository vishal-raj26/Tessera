/** The balance to show for `wallet`: only one fetched for that same address (else null: show the address). */
export const shownBalance = (fetched: { address: string; gram: number | null } | null, wallet: string): number | null =>
  fetched && wallet && fetched.address === wallet ? fetched.gram : null;
