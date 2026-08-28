"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import Container from "@/app/components/ui/Container"
import Section from "@/app/components/ui/Section"
import Button from "@/app/components/ui/Button"
import { useWallet } from "@/app/components/solana/WalletContext"

export default function Hero() {
  const router = useRouter()
  const { isConnected, wallet } = useWallet()
  const [loading, setLoading] = useState(false)

  const handleEnterSanctuary = async () => {
    // 1) Pas de wallet -> choose-character
    if (!isConnected || !wallet) {
      router.push("/choose-character")
      return
    }

    setLoading(true)

    try {
      // 2) Check serveur: est-ce que ce wallet a déjà un perso ?
      const res = await fetch(
        `/api/player/exists?wallet=${encodeURIComponent(wallet)}`,
        { method: "GET", cache: "no-store" }
      )

      // ✅ Important: ne pas faire res.json() si la réponse n'est pas OK
      if (!res.ok) {
        const txt = await res.text()
        console.error("GET /api/player/exists error:", res.status, txt)
        router.push("/choose-character")
        return
      }

      const data = await res.json()

      if (data?.hasCharacter) {
        router.push("/inventory")
      } else {
        router.push("/choose-character")
      }
    } catch (e) {
      console.error("handleEnterSanctuary failed:", e)
      router.push("/choose-character")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Section className="pt-24 pb-32">
      <Container>
        <div className="max-w-2xl">
          <p className="text-gold/90 tracking-[0.35em] uppercase text-sm">
            Drakrun
          </p>

          <h1 className="mt-6 text-4xl sm:text-6xl font-bold leading-tight">
            Claim Your Dragon.
            <br />
            Master the Runes.
          </h1>

          <p className="mt-6 text-muted max-w-xl">
            Entre dans un monde mystique : invoque ton dragon, collecte des runes,
            progresse et domine l’économie du jeu.
          </p>

          <div className="mt-8 flex gap-4">
            {/* IMPORTANT: pas de href -> navigation contrôlée */}
            <Button
              variant="primary"
              onClick={handleEnterSanctuary}
              disabled={loading}
            >
              {loading ? "Vérification..." : "Entrer dans le Sanctuaire"}
            </Button>

            {/* Invoquer un dragon : si wallet connecté -> désactivé */}
            <div
              className={isConnected ? "pointer-events-none opacity-60" : ""}
              title={isConnected ? "Déconnecte ton wallet pour invoquer." : ""}
              aria-disabled={isConnected}
            >
              <Button href="/choose-character" variant="secondary">
                Invoquer un dragon
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  )
}
