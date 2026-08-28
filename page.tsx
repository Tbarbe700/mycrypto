import { auth } from "@/auth"
import { prisma } from "@/src/lib/prisma"
import { redirect } from "next/navigation"

export default async function Home() {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { player: true },
  })

  if (!user?.player) redirect("/api/me")

  if (!user.player.character) {
    redirect("/choose-character")
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Accueil</h1>
      <p>Connecté ✅</p>
      <p>Personnage choisi : <b>{user.player.character}</b></p>
    </main>
  )
}
