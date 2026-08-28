import Button from "@/app/components/ui/Button"

export type RuneCardProps = {
  title: string
  description: string
  imageSrc: string
  imageAlt?: string
  cta?: {
    label: string
    href: string
    variant?: "primary" | "secondary"
  }
}

const CARD_MIN_H = 520
const TOP_H = 270 // <-- AJUSTE ICI jusqu’à ce que ça tombe pile sur le "trait"

export default function RuneCard({
  title,
  description,
  imageSrc,
  imageAlt = "",
  cta,
}: RuneCardProps) {
  return (
    <div className="relative">
      <div className="relative overflow-visible">
        {/* PANEL FLOU = référence */}
        <div
          className="
            relative z-10
            rounded-[28px]
            border border-white/15
            bg-black/30
            backdrop-blur-xl
            shadow-[0_20px_60px_rgba(0,0,0,0.6)]
            overflow-hidden
          "
          style={{ minHeight: CARD_MIN_H }}
        >
          {/* ZONE IMAGE (doit aller jusqu'au trait) */}
          <div className="relative w-full" style={{ height: TOP_H }}>
            <img
              src={imageSrc}
              alt={imageAlt}
              draggable={false}
              loading="lazy"
              className="h-full w-full object-cover"
            />

            {/* Optionnel : léger assombrissement bas de l'image pour lisibilité */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/20" />
          </div>

          {/* CONTENU (tout en dessous du trait) */}
          <div className="flex flex-col p-6">
            <h3 className="text-xl font-extrabold tracking-tight text-white">
              {title}
            </h3>

            <p className="mt-3 text-sm leading-relaxed text-white/75">
              {description}
            </p>

            <div className="mt-auto pt-6">
              {cta ? (
                <Button href={cta.href} variant={cta.variant ?? "secondary"}>
                  {cta.label}
                </Button>
              ) : (
                <div className="h-[44px]" aria-hidden="true" />
              )}
            </div>
          </div>
        </div>

        {/* CADRE au-dessus (tu as dit qu’il est parfait -> on le garde tel quel) */}
        <img
          src="/img/frames/rune-card-frame.png"
          alt=""
          draggable={false}
          className="
            pointer-events-none
            absolute inset-0
            z-30
            h-full w-full
            object-fill
            origin-center
            scale-[1.14]
            translate-z-0
          "
        />
      </div>
    </div>
  )
}
