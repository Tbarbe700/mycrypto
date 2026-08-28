import { auth } from "@/auth"
import { prisma } from "@/src/lib/prisma"
import { redirect } from "next/navigation"
import ChestClient from "./ChestClient"

export default async function ChestsPage() {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { player: true },
  })
  if (!user?.player) redirect("/api/me")

  return (
    <main className="min-h-screen bg-[#07090A] text-white">
      {/* subtle background */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(16,185,129,0.18),transparent_45%),radial-gradient(circle_at_80%_30%,rgba(255,255,255,0.06),transparent_40%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/25 to-black/60" />
      </div>

      <div className="mx-auto w-full max-w-[1200px] px-6 py-8">
        <ChestClient initialBalance={user.player.balance} />
      </div>
    </main>
  )
}