// Telegram Stars amount mark: a plain gold star (no Telegram logo).
export function StarIcon({ size = 16 }: { size?: number }) {
  return (
    <svg className="star-ic" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="star-g" x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFD86B" />
          <stop offset="1" stopColor="#F2A93B" />
        </linearGradient>
      </defs>
      <path
        fill="url(#star-g)"
        d="M11.05 2.93c.39-.8 1.52-.8 1.9 0l2.33 4.77 5.24.77c.87.13 1.22 1.2.59 1.81l-3.8 3.71.9 5.23c.15.87-.76 1.53-1.54 1.12L12 17.87l-4.67 2.47c-.78.41-1.69-.25-1.54-1.12l.9-5.23-3.8-3.7c-.63-.62-.28-1.69.59-1.82l5.24-.77 2.33-4.77Z"
      />
    </svg>
  );
}
