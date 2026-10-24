/**
 * Static hero backdrop. The print texture stays flat; the only motion in the
 * hero is the work surface itself.
 */
export function HeroAtmosphere({ children }: { children: React.ReactNode }) {
  return (
    <div className="atmosphere hero-atmosphere">
      <div aria-hidden="true" className="hero-halftone grid-field" />
      {children}
    </div>
  );
}
