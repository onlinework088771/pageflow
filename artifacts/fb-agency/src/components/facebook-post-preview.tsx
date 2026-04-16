import { useRef, useEffect, useState } from "react";
import { Monitor, Smartphone, Sun, Moon, Play, ThumbsUp, MessageCircle, Share2, Globe } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface FacebookPostPreviewProps {
  title: string;
  caption: string;
  videoFile: File | null;
  videoUrl: string;
  pageName: string;
  pageAvatar?: string;
}

type PreviewMode = "desktop" | "mobile";
type ThemeMode = "light" | "dark";

export function FacebookPostPreview({
  title,
  caption,
  videoFile,
  videoUrl,
  pageName,
  pageAvatar,
}: FacebookPostPreviewProps) {
  const [previewMode, setPreviewMode] = useState<PreviewMode>("desktop");
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoFile) {
      const url = URL.createObjectURL(videoFile);
      setObjectUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setObjectUrl(null);
      return undefined;
    }
  }, [videoFile]);

  const isDark = themeMode === "dark";
  const isMobile = previewMode === "mobile";

  const activeVideoSrc = objectUrl || videoUrl || null;

  const displayName = pageName || "Your Page Name";
  const displayTitle = title || "Untitled Video";
  const now = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const fbBg = isDark ? "#18191a" : "#f0f2f5";
  const cardBg = isDark ? "#242526" : "#ffffff";
  const textPrimary = isDark ? "#e4e6ea" : "#050505";
  const textSecondary = isDark ? "#b0b3b8" : "#65676b";
  const borderColor = isDark ? "#3a3b3c" : "#dddfe2";
  const reactionBg = isDark ? "#3a3b3c" : "#f0f2f5";

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-sm font-semibold text-foreground">Live Preview</span>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-border overflow-hidden text-xs font-medium">
            <button
              onClick={() => setPreviewMode("desktop")}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 transition-colors ${
                previewMode === "desktop"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              <Monitor className="h-3.5 w-3.5" />
              Desktop
            </button>
            <button
              onClick={() => setPreviewMode("mobile")}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 transition-colors ${
                previewMode === "mobile"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              <Smartphone className="h-3.5 w-3.5" />
              Mobile
            </button>
          </div>

          <button
            onClick={() => setThemeMode((t) => (t === "light" ? "dark" : "light"))}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-background text-muted-foreground hover:bg-muted transition-colors text-xs font-medium"
          >
            {isDark ? <Sun className="h-3.5 w-3.5 text-yellow-400" /> : <Moon className="h-3.5 w-3.5" />}
            {isDark ? "Light" : "Dark"}
          </button>
        </div>
      </div>

      <div
        className="flex-1 flex items-start justify-center rounded-xl overflow-hidden transition-colors duration-300 p-4"
        style={{ background: fbBg, minHeight: 360 }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={previewMode}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.2 }}
            style={{
              width: isMobile ? 375 : "100%",
              maxWidth: isMobile ? 375 : "100%",
              borderRadius: isMobile ? 20 : 8,
              overflow: "hidden",
              boxShadow: isMobile
                ? "0 0 0 8px #1a1a1a, 0 20px 40px rgba(0,0,0,0.4)"
                : "0 1px 3px rgba(0,0,0,0.12)",
              background: cardBg,
              border: `1px solid ${borderColor}`,
            }}
          >
            <div className="p-3" style={{ borderBottom: `1px solid ${borderColor}` }}>
              <div className="flex items-center gap-2">
                <div
                  className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 overflow-hidden"
                  style={{ background: "linear-gradient(135deg, #1877f2, #0d65d9)" }}
                >
                  {pageAvatar ? (
                    <img src={pageAvatar} alt={displayName} className="h-full w-full object-cover" />
                  ) : (
                    displayName.substring(0, 2).toUpperCase()
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-tight truncate" style={{ color: textPrimary }}>
                    {displayName}
                  </p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[11px]" style={{ color: textSecondary }}>{now}</span>
                    <span style={{ color: textSecondary }} className="text-[11px]">·</span>
                    <Globe className="h-3 w-3" style={{ color: textSecondary }} />
                  </div>
                </div>
              </div>

              {(title || caption) && (
                <div className="mt-2.5 space-y-1">
                  {title && (
                    <p className="text-sm font-semibold" style={{ color: textPrimary }}>{displayTitle}</p>
                  )}
                  {caption && (
                    <p
                      className="text-sm leading-relaxed"
                      style={{ color: textPrimary, whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                    >
                      {caption}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div
              className="relative flex items-center justify-center"
              style={{
                background: isDark ? "#000" : "#000",
                minHeight: isMobile ? 200 : 260,
                aspectRatio: "16/9",
              }}
            >
              {activeVideoSrc ? (
                <video
                  ref={videoRef}
                  src={activeVideoSrc}
                  controls
                  className="w-full h-full object-contain"
                  style={{ display: "block", maxHeight: isMobile ? 210 : 310 }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 py-10 px-6 text-center w-full">
                  <div className="h-14 w-14 rounded-full bg-white/10 flex items-center justify-center">
                    <Play className="h-7 w-7 text-white/60" />
                  </div>
                  <p className="text-white/50 text-sm">Upload a video or paste a URL to preview</p>
                </div>
              )}
            </div>

            <div className="px-3 py-2" style={{ borderTop: `1px solid ${borderColor}` }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <span className="text-[11px]" style={{ color: textSecondary }}>👍 ❤️ 😂</span>
                  <span className="text-[11px] ml-1" style={{ color: textSecondary }}>1.2K</span>
                </div>
                <div className="flex items-center gap-2 text-[11px]" style={{ color: textSecondary }}>
                  <span>234 comments</span>
                  <span>·</span>
                  <span>56 shares</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 divide-x" style={{ borderTop: `1px solid ${borderColor}`, borderColor }}>
              {[
                { icon: ThumbsUp, label: "Like" },
                { icon: MessageCircle, label: "Comment" },
                { icon: Share2, label: "Share" },
              ].map(({ icon: Icon, label }) => (
                <button
                  key={label}
                  className="flex items-center justify-center gap-1.5 py-2 text-xs font-semibold transition-colors"
                  style={{
                    color: textSecondary,
                    background: "transparent",
                    borderColor,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = reactionBg)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <p className="text-[10px] text-muted-foreground text-center">
        Preview is approximate. Actual appearance may vary on Facebook.
      </p>
    </div>
  );
}
