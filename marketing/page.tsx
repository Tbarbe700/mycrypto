import GameHeader from "@/app/components/GameHeader"
import Hero from "@/app/components/marketing/Hero"
import Stats from "@/app/components/marketing/Stats"
import RuneCards from "@/app/components/marketing/RuneCards"
import Footer from "@/app/components/marketing/Footer"

export default function Page() {
  return (
    <>
      <GameHeader />
      <main className="pt-[74px]">
        <Hero />
        <Stats />
        <RuneCards />
        <Footer />
      </main>
    </>
  )
}
