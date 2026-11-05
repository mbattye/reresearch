// Inline stroke icons (24px grid) so there's no icon dependency.
type P = { className?: string; filled?: boolean };

const base = (filled?: boolean) => ({
  viewBox: "0 0 24 24",
  fill: filled ? "currentColor" : "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const HeartIcon = ({ className, filled }: P) => (
  <svg {...base(filled)} className={className}>
    <path d="M12 20s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 10c0 5.65-7 10-7 10Z" />
  </svg>
);

export const BookmarkIcon = ({ className, filled }: P) => (
  <svg {...base(filled)} className={className}>
    <path d="M6 4h12v16l-6-4-6 4V4Z" />
  </svg>
);

export const EyeOffIcon = ({ className }: P) => (
  <svg {...base()} className={className}>
    <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A9.8 9.8 0 0 1 12 5c5 0 9 5 9 7a8.7 8.7 0 0 1-2.4 3.4M6.6 6.6C4.4 8 3 10.4 3 12c0 2 4 7 9 7a9.6 9.6 0 0 0 4.4-1.1" />
  </svg>
);

export const ExternalIcon = ({ className }: P) => (
  <svg {...base()} className={className}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
);

export const SettingsIcon = ({ className }: P) => (
  <svg {...base()} className={className}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </svg>
);

export const BackIcon = ({ className }: P) => (
  <svg {...base()} className={className}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
);
