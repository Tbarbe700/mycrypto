import { auth } from "@/auth"
import { prisma } from "@/src/lib/prisma"
import { redirect } from "next/navigation"
import ChooseCharacterClient from "./ChooseCharacterClient"

export default async function ChooseCharacterPage() {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { player: true },
  })

  if (!user?.player) redirect("/api/me")

  // ⛔ sécurité absolue : si déjà choisi → dehors
  if (user.player.character) redirect("/")

  return (
    <main style={{ padding: 24 }}>
      <h1>Choisis ton personnage</h1>
      <p>Tu ne peux choisir qu’une seule fois (pour l’instant).</p>

      {/* 👇 AJOUT WEB3 ICI */}
      <ChooseCharacterClient
        initialUnlocked={user.player.characterUnlocked}
      />
    </main>
  )
}
