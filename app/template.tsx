/**
 * Re-mounts on every route change (unlike layout.tsx), giving each page a soft
 * fade-in. Opacity only — see `.route-enter` in globals.css.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="route-enter">{children}</div>;
}
