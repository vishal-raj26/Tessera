// The bot's command menus, shared by bot:setup and live so neither overwrites the other's.
export const BUYER_COMMANDS = [
  { command: 'start', description: 'Open Tessera' },
  { command: 'paysupport', description: 'Help with a payment' },
  { command: 'terms', description: 'Terms of sale' },
];
export const ADMIN_COMMANDS = [
  { command: 'issues', description: 'Orders that need you' },
  { command: 'order', description: 'Look up an order by id or memo' },
  { command: 'prices', description: 'In-app prices we sell against' },
  { command: 'price', description: 'Change one: /price max5_m 129.99' },
  { command: 'start', description: 'Admin help' },
];
