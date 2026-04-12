const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const LOGO_SRC = `${BASE}/pageflow-logo.png`;

interface PageFlowLogoProps {
  /** Controls the rendered height. Width scales proportionally. */
  size?: "xs" | "sm" | "md" | "lg";
  /**
   * "dark" – apply a strong brightness/contrast boost for dark backgrounds (auth pages)
   * "nav"  – moderate boost suited for the glass navbar
   */
  variant?: "dark" | "nav";
  className?: string;
}

const sizeMap: Record<string, string> = {
  xs: "h-5",
  sm: "h-8",
  md: "h-11",
  lg: "h-16",
};

const filterMap: Record<string, string> = {
  /* Renders the logo as pure white + a purple glow — ideal for dark page backgrounds */
  dark: "brightness(0) invert(1) drop-shadow(0 0 14px rgba(139,92,246,0.55))",
  /* Slight boost for the glass navbar — preserves natural colours */
  nav:  "brightness(1.5) saturate(1.2) drop-shadow(0 0 8px rgba(139,92,246,0.25))",
};

export function PageFlowLogo({ size = "sm", variant = "nav", className = "" }: PageFlowLogoProps) {
  return (
    <img
      src={LOGO_SRC}
      alt="PageFlow"
      draggable={false}
      className={`${sizeMap[size]} w-auto object-contain select-none ${className}`}
      style={{ filter: filterMap[variant] }}
    />
  );
}
