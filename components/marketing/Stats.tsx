import Container from "@/app/components/ui/Container"
import Section from "@/app/components/ui/Section"
import Card from "@/app/components/ui/Card"

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-sm text-muted">{label}</div>
    </div>
  )
}

export default function Stats() {
  return (
    <Section className="py-8 sm:py-10">
      <Container>
        <Card className="p-6" glow="gold">
          <div className="grid gap-6 sm:grid-cols-3">
            <Stat label="Joueurs" value="8,736" />
            <Stat label="Dragons invoqués" value="1,492" />
            <Stat label="SOL brûlés" value="52,470,120" />
          </div>
        </Card>
      </Container>
    </Section>
  )
}
