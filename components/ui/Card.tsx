import { cn } from "@/src/lib/cn"

export default function Card({
  className,
  glow = "ember",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { glow?: "ember" | "ice" | "gold" }) {
  const glowClass =
    glow === "ice"
      ? "shadow-glowIce"
      : glow === "gold"
        ? "shadow-[0_0_24px_rgba(214,176,112,0.18)]"
        : "shadow-glowEmber"

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-stroke/10 bg-panel/60 backdrop-blur",
        glowClass,
        className
      )}
      {...props}
    >
      {/* petit “liseré” décoratif sans image */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-stroke/10 to-transparent opacity-30" />
      <div className="relative">{props.children}</div>
    </div>
  )
}
