import Container from "@/app/components/ui/Container"
import Section from "@/app/components/ui/Section"
import RuneCard, { type RuneCardProps } from "./RuneCard"

const CARDS: RuneCardProps[] = [
  {
    title: "Summon Your Dragon",
    description:
      "Dépense des SOL pour invoquer un dragon unique, avec ses attributs et capacités.",
    imageSrc: "/img/cards/card-dragon-fixed.png",
    imageAlt: "Summon your dragon",
  },
  {
    title: "Collect Mystic Runes",
    description:
      "Récupère des runes rares et puissantes pour renforcer ton dragon et débloquer du contenu.",
    imageSrc: "/img/cards/card-runes-fixed.png",
    imageAlt: "Collect runes",
    cta: { label: "Voir le guide", href: "/guide", variant: "secondary" },
  },
  {
    title: "Burn, Earn, Dominate",
    description:
      "Brûle, progresse et grimpe. Domine l’économie et impose ta légende.",
    imageSrc: "/img/cards/card-burn-fixed.png",
    imageAlt: "Burn earn dominate",
  },
]

export default function RuneCards() {
  return (
    <Section className="py-14 sm:py-20">
      <Container>
        <div className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-text">
            Le pouvoir des runes
          </h2>
          <p className="mt-2 text-muted">
            Trois piliers simples : invoquer, collecter, dominer.
          </p>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {CARDS.map((card) => (
            <RuneCard key={card.title} {...card} />
          ))}
        </div>
      </Container>
    </Section>
  )
}
