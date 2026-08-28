type Rarity = "COMMON" | "RARE" | "EPIC" | "LEGENDARY"

export default function RuneIcon({
  runeType,
  rarity,
  size = 72,
}: {
  runeType: string | null | undefined
  rarity: Rarity | string
  size?: number
}) {
  const safeRune = (runeType || "").toLowerCase().trim()
  const safeRarity = String(rarity || "COMMON").toLowerCase().trim()

  // public/img/frames/*.png
  // public/img/runes/*.png
  const frameSrc = `/img/frames/${safeRarity}.png`
  const runeSrc = safeRune ? `/img/runes/${safeRune}.png` : "/img/runes/ignivar.png"

  // ✅ ratio plus grand => meilleure lisibilité en slot
  const runeSize = Math.round(size * 0.74)

  return (
    <div
      className="relative select-none"
      style={{ width: size, height: size }}
      title={`${runeType ?? "?"} • ${rarity}`}
    >
      {/* soft back glow (subtle) */}
      <div
        className="absolute left-1/2 top-1/2 -z-10 rounded-full"
        style={{
          width: Math.round(size * 0.88),
          height: Math.round(size * 0.88),
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.10), rgba(255,255,255,0.00) 62%)",
        }}
      />

      {/* Frame */}
      <img
        src={frameSrc}
        alt={`${rarity} frame`}
        width={size}
        height={size}
        className="absolute inset-0 h-full w-full object-contain pointer-events-none"
        draggable={false}
      />

      {/* Rune */}
      <img
        src={runeSrc}
        alt={runeType ?? "rune"}
        width={runeSize}
        height={runeSize}
        className="absolute left-1/2 top-1/2 object-contain pointer-events-none"
        style={{
          transform: "translate(-50%, -50%)",
          filter:
            "drop-shadow(0 0 18px rgba(255,255,255,0.22)) drop-shadow(0 0 34px rgba(16,185,129,0.10))",
        }}
        draggable={false}
      />

      {/* tiny shine */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2"
        style={{
          width: runeSize,
          height: runeSize,
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.18), rgba(255,255,255,0.00) 55%)",
          mixBlendMode: "screen",
        }}
      />
    </div>
  )
}