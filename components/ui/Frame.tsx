// app/components/ui/Frame.tsx
import React from "react"

type FrameProps = {
  src: string
  children?: React.ReactNode
  className?: string
  paddingClassName?: string
  withInnerPanel?: boolean
  innerOpacity?: "light" | "medium" | "strong"
  glow?: "none" | "soft" | "strong"
  fit?: "contain" | "fill"
  priority?: boolean
}

export default function Frame({
  src,
  children,
  className = "",
  paddingClassName = "p-6",
  withInnerPanel = true,
  innerOpacity = "light",
  glow = "none",
  fit = "contain",
}: FrameProps) {
  const glowCls =
    glow === "strong"
      ? "shadow-[0_0_40px_rgba(34,197,94,0.28)]"
      : glow === "soft"
      ? "shadow-[0_0_24px_rgba(59,130,246,0.18)]"
      : ""

  // ✅ plus transparent par défaut (AAA, laisse vivre le décor)
  const panelBg =
    innerOpacity === "strong"
      ? "bg-black/26"
      : innerOpacity === "medium"
      ? "bg-black/18"
      : "bg-black/12"

  const imgFit = fit === "fill" ? "object-fill" : "object-contain"

  return (
    <div className={`relative ${glowCls} ${className}`}>
      {/* Frame image */}
      <img
        src={src}
        alt=""
        className={[
          "pointer-events-none absolute inset-0 h-full w-full select-none",
          imgFit,
          // ✅ profondeur AAA (relief)
          "drop-shadow-[0_22px_46px_rgba(0,0,0,0.65)]",
        ].join(" ")}
        draggable={false}
      />

      {/* Content zone */}
      <div className={`relative h-full w-full ${paddingClassName}`}>
        {withInnerPanel ? (
          <div
            className={[
              "relative h-full w-full",
              // ✅ moins “web-card”, plus “game-ui”
              "rounded-[12px]",
              panelBg,
              // ✅ bord subtil
              "ring-1 ring-white/10",
              // ✅ profondeur intérieure
              "shadow-[inset_0_0_110px_rgba(0,0,0,0.55)]",
              // ✅ glass
              "backdrop-blur-[2px]",
            ].join(" ")}
          >
            {/* highlight top */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-10 rounded-t-[12px] bg-gradient-to-b from-white/10 to-transparent" />
            {/* highlight edges (subtil) */}
            <div className="pointer-events-none absolute inset-0 rounded-[12px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]" />

            {/* inner padding */}
            <div className="relative h-full w-full p-4">{children}</div>
          </div>
        ) : (
          <div className="relative h-full w-full">{children}</div>
        )}
      </div>
    </div>
  )
}
