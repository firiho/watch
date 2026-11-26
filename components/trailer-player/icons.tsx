/**
 * Stroke icons for the trailer player, theater and detail modal.
 * 24×24 grid, round caps — sized and colored by the parent (currentColor).
 */

type IconProps = { className?: string };

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

export const IconSoundOn = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M11 5.5 6.6 9H4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2.6l4.4 3.5a.6.6 0 0 0 1-.47V5.97a.6.6 0 0 0-1-.47Z" fill="currentColor" />
    <path d="M15.5 9.2a4 4 0 0 1 0 5.6" />
    <path d="M18.3 6.6a7.6 7.6 0 0 1 0 10.8" />
  </svg>
);

export const IconSoundOff = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M11 5.5 6.6 9H4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2.6l4.4 3.5a.6.6 0 0 0 1-.47V5.97a.6.6 0 0 0-1-.47Z" fill="currentColor" />
    <path d="m16 9.5 5 5" />
    <path d="m21 9.5-5 5" />
  </svg>
);

export const IconExpand = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M14.5 4H20v5.5" />
    <path d="M9.5 20H4v-5.5" />
    <path d="M20 4l-6.2 6.2" />
    <path d="M4 20l6.2-6.2" />
  </svg>
);

export const IconReplay = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
    <path d="M4.5 4.5v4h4" />
  </svg>
);

export const IconPlay = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M8 5.8v12.4a.9.9 0 0 0 1.37.77l10.1-6.2a.9.9 0 0 0 0-1.54L9.37 5.03A.9.9 0 0 0 8 5.8Z" fill="currentColor" stroke="none" />
  </svg>
);

export const IconPause = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <rect x="6.5" y="5.25" width="3.75" height="13.5" rx="1.1" fill="currentColor" stroke="none" />
    <rect x="13.75" y="5.25" width="3.75" height="13.5" rx="1.1" fill="currentColor" stroke="none" />
  </svg>
);

export const IconClose = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M6.5 6.5l11 11" />
    <path d="M17.5 6.5l-11 11" />
  </svg>
);

export const IconArrowUpRight = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M7.5 16.5l9-9" />
    <path d="M9 7.5h7.5V15" />
  </svg>
);
