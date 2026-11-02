// Saving "redeemed" ticks without races. For each code only one save is in flight at a time; taps made
// meanwhile just change what we want, and when the save returns we send again if it still differs.
// The screen always ends on the server's answer: success shows the server's value, failure shows the
// last value the server confirmed. No imports, so it can be tested on its own (web/test).

export type Mark = number | null; // redeemedAt, or null when not ticked

interface State { confirmed: Mark; want: boolean; busy: boolean }

export interface MarkQueue {
  /** `current` is the value on screen before this tap (used as the starting point for a code). */
  mark(orderId: string, index: number, current: Mark, redeemed: boolean): void;
}

export function createMarkQueue(opts: {
  send: (orderId: string, index: number, redeemed: boolean) => Promise<Mark>;
  show: (orderId: string, index: number, value: Mark) => void;
  failed: (orderId: string, index: number, redeemed: boolean) => void;
  now?: () => number;
}): MarkQueue {
  const states = new Map<string, State>();
  const now = opts.now ?? Date.now;

  function pump(orderId: string, index: number, s: State) {
    if (!!s.confirmed === s.want) {
      s.busy = false;
      opts.show(orderId, index, s.confirmed);
      return;
    }
    s.busy = true;
    const sent = s.want;
    opts.send(orderId, index, sent).then(
      (value) => { s.confirmed = value; pump(orderId, index, s); },
      () => {
        // nothing more is sent for this code: back to what the server last confirmed
        s.want = !!s.confirmed;
        s.busy = false;
        opts.show(orderId, index, s.confirmed);
        opts.failed(orderId, index, sent);
      },
    );
  }

  return {
    mark(orderId, index, current, redeemed) {
      const key = `${orderId}:${index}`;
      let s = states.get(key);
      if (!s) { s = { confirmed: current, want: !!current, busy: false }; states.set(key, s); }
      else if (!s.busy) s.confirmed = current; // idle: the screen holds the latest server value
      s.want = redeemed;
      opts.show(orderId, index, redeemed ? (s.confirmed || now()) : null); // shown at once
      if (!s.busy) pump(orderId, index, s);
    },
  };
}
