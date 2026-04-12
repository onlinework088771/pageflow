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
  dark: "brightness(10) saturate(0.55) drop-shadow(0 0 12px rgba(139,92,246,0.5))",
  nav:  "brightness(1.4) drop-shadow(0 0 8px rgba(139,92,246,0.3))",
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
