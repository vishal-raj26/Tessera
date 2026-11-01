// Thin wrapper over the Telegram Mini App SDK that degrades gracefully in a normal browser.
type Haptic = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
export type InvoiceStatus = 'paid' | 'cancelled' | 'failed' | 'pending';

interface BottomButton {
  setParams(p: { text?: string; color?: string; text_color?: string; is_active?: boolean; is_visible?: boolean; has_shine_effect?: boolean; position?: string }): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
  showProgress(leaveActive?: boolean): void;
  hideProgress(): void;
  show(): void;
  hide(): void;
}

interface TgWebApp {
  initData: string;
  colorScheme?: 'light' | 'dark';
  themeParams?: Record<string, string>;
  ready(): void;
  expand(): void;
  disableVerticalSwipes?(): void;
  setHeaderColor?(c: string): void;
  setBackgroundColor?(c: string): void;
  setBottomBarColor?(c: string): void;
  openLink?(url: string): void;
  openInvoice?(url: string, cb?: (status: InvoiceStatus) => void): void;
  isVersionAtLeast?(v: string): boolean;
  MainButton?: BottomButton;
  SecondaryButton?: BottomButton;
  HapticFeedback?: {
    impactOccurred(s: Haptic): void;
    notificationOccurred(t: 'success' | 'warning' | 'error'): void;
    selectionChanged(): void;
  };
  CloudStorage?: {
    getItem(key: string, cb: (err: unknown, value?: string) => void): void;
    setItem(key: string, value: string, cb?: (err: unknown, ok?: boolean) => void): void;
  };
  BackButton?: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  // Mini Apps 2.0 (Bot API 8.0+)
  platform?: string;
  isFullscreen?: boolean;
  requestFullscreen?(): void;
  addToHomeScreen?(): void;
  checkHomeScreenStatus?(cb: (status: 'unsupported' | 'unknown' | 'added' | 'missed') => void): void;
  enableClosingConfirmation?(): void;
  disableClosingConfirmation?(): void;
  DeviceOrientation?: {
    start(params: { refresh_rate?: number; need_absolute?: boolean }, cb?: (ok: boolean) => void): void;
    stop(cb?: (ok: boolean) => void): void;
    isStarted: boolean;
    alpha: number | null;
    beta: number | null;
    gamma: number | null;
  };
  onEvent?(event: string, cb: () => void): void;
  offEvent?(event: string, cb: () => void): void;
}

const wa: TgWebApp | undefined = (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
const inTelegram = !!wa?.initData;

export const tg = {
  inTelegram,
  initData: wa?.initData ?? '',
  /** 'ios', 'android', 'tdesktop', 'web'… (empty outside Telegram) */
  platform: inTelegram ? wa?.platform ?? '' : '',
  main: inTelegram ? wa?.MainButton : undefined,
  secondary: inTelegram && wa?.isVersionAtLeast?.('7.10') ? wa?.SecondaryButton : undefined,
  boot() {
    if (!wa || !inTelegram) return;
    document.documentElement.classList.add('tg');
    wa.ready();
    wa.expand();
    wa.disableVerticalSwipes?.(); // the pull-down-to-buy gesture needs this
    wa.setHeaderColor?.('#141413');
    wa.setBackgroundColor?.('#141413');
    wa.setBottomBarColor?.('#141413');
    wa.MainButton?.hide();
    // Full screen on phones (Bot API 8.0); Telegram exposes safe areas as CSS variables we pad with.
    const mobile = wa.platform === 'ios' || wa.platform === 'android';
    if (mobile && wa.isVersionAtLeast?.('8.0') && !wa.isFullscreen) {
      try { wa.requestFullscreen?.(); } catch { /* not allowed on this client */ }
    }
    if (mobile) document.documentElement.classList.add('tg-full');
  },
  /**
   * Tilt for the card and parallax, normalised to -1..1.
   * Uses Telegram's DeviceOrientation (no iOS permission prompt) and falls back to the browser event.
   */
  onTilt(cb: (x: number, y: number) => void) {
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    const DO = inTelegram && wa?.isVersionAtLeast?.('8.0') ? wa.DeviceOrientation : undefined;
    if (DO && wa?.onEvent) {
      const h = () => {
        if (DO.beta == null || DO.gamma == null) return;
        // radians → about ±35° of gamma and ±25° of beta around holding angle
        cb(clamp(DO.gamma / 0.6), clamp((DO.beta - 0.8) / 0.45));
      };
      DO.start({ refresh_rate: 50 });
      wa.onEvent('deviceOrientationChanged', h);
      return () => { wa.offEvent?.('deviceOrientationChanged', h); };
    }
    const h = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      cb(clamp(e.gamma / 35), clamp((e.beta - 45) / 25));
    };
    addEventListener('deviceorientation', h);
    return () => removeEventListener('deviceorientation', h);
  },
  /** Keep the app from closing by accident while money is moving. */
  guardClose(on: boolean) {
    if (!inTelegram) return;
    if (on) wa?.enableClosingConfirmation?.();
    else wa?.disableClosingConfirmation?.();
  },
  /** Resolves true when the client can add the app to the home screen and it isn't there yet. */
  canAddToHome(): Promise<boolean> {
    if (!inTelegram || !wa?.isVersionAtLeast?.('8.0') || !wa.checkHomeScreenStatus) return Promise.resolve(false);
    return new Promise((res) => wa.checkHomeScreenStatus!((st) => res(st === 'missed')));
  },
  addToHome() { wa?.addToHomeScreen?.(); },
  /** Recolor Telegram's own header/bottom bar so they blend with the current screen. */
  chrome(color: string) {
    if (!inTelegram) return;
    wa?.setHeaderColor?.(color);
    wa?.setBackgroundColor?.(color);
    wa?.setBottomBarColor?.(color);
  },
  tap: (s: Haptic = 'light') => wa?.HapticFeedback?.impactOccurred(s),
  select: () => wa?.HapticFeedback?.selectionChanged(),
  notify: (t: 'success' | 'warning' | 'error') => wa?.HapticFeedback?.notificationOccurred(t),
  /** Telegram's native Stars checkout. Resolves with how the sheet closed. */
  openInvoice(url: string): Promise<InvoiceStatus> {
    if (!inTelegram || !wa?.openInvoice) return Promise.reject(new Error('Open Tessera inside Telegram to pay with Stars.'));
    return new Promise((res) => wa.openInvoice!(url, res));
  },
  openLink(url: string) {
    if (inTelegram && wa?.openLink) wa.openLink(url);
    else window.open(url, '_blank', 'noopener');
  },
  /** Per-user flag stored in Telegram CloudStorage (follows the user across devices), with localStorage fallback. */
  getFlag(key: string): Promise<boolean> {
    const cs = inTelegram ? wa?.CloudStorage : undefined;
    let local = false;
    try { local = localStorage.getItem(key) === '1'; } catch { /* ignore */ }
    if (!cs || local) return Promise.resolve(local);
    return new Promise((res) => {
      const t = setTimeout(() => res(local), 1500);
      cs.getItem(key, (err, v) => { clearTimeout(t); res(!err && v === '1'); });
    });
  },
  setFlag(key: string) {
    try { localStorage.setItem(key, '1'); } catch { /* ignore */ }
    if (inTelegram) wa?.CloudStorage?.setItem(key, '1');
  },
  back(cb: (() => void) | null) {
    const b = inTelegram ? wa?.BackButton : undefined;
    if (!b) return () => {};
    if (!cb) { b.hide(); return () => {}; }
    b.show();
    b.onClick(cb);
    return () => { b.offClick(cb); b.hide(); };
  },
};
