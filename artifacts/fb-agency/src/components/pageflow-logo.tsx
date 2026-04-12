const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const LOGO_SRC = `${BASE}/pageflow-logo-trimmed.png`;

interface PageFlowLogoProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  variant?: "dark" | "nav";
  className?: string;
}

const sizeMap: Record<string, string> = {
  xs: "h-5",
  sm: "h-7",
  md: "h-9",
  lg: "h-12",
  xl: "h-16",
};

const filterMap: Record<string, string> = {
  dark: "brightness(0) invert(1) drop-shadow(0 0 14px rgba(139,92,246,0.55))",
  nav:  "brightness(1.3) saturate(1.2) drop-shadow(0 0 6px rgba(139,92,246,0.2))",
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
