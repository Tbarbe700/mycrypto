import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/src/lib/prisma"
import { settlePending } from "@/src/lib/settlePending"

const DECAY_INTERVAL_SEC = 60

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.redirect(new URL("/login", req.url))

  const form = await req.formData()
  const playerItemId = String(form.get("playerItemId") ?? "")
  if (!playerItemId) return NextResponse.redirect(new URL("/inventory", req.url))

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { player: true },
  })
  if (!user?.player) return NextResponse.redirect(new URL("/api/me", req.url))

  const playerId = user.player.id
  const now = new Date()

  try {
    await prisma.$transaction(async (tx) => {
      await settlePending(tx, playerId)

      const pi = await tx.playerItem.findFirst({
        where: { id: playerItemId, playerId },
        select: { id: true, equipped: true, lastItemDecayAt: true },
      })
      if (!pi) return

      if (!pi.equipped) return

      const next = pi.lastItemDecayAt.getTime() + DECAY_INTERVAL_SEC * 1000
      const remainingSec = Math.max(0, Math.floor((next - now.getTime()) / 1000))

      await tx.playerItem.update({
        where: { id: pi.id },
        data: {
          equipped: false,
          decayCarrySec: remainingSec, // ✅ on gèle ici
        },
      })
    })
  } catch (e) {
    console.error("UNEQUIP ERROR:", e)
  }

  return NextResponse.redirect(new URL("/inventory", req.url))
}
