import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/src/lib/prisma"
import { settlePending } from "@/src/lib/settlePending"

function safeNum(x: any, fallback = 0) {
  const n = typeof x === "number" ? x : Number(x)
  return Number.isFinite(n) ? n : fallback
}

export async function POST() {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { player: true },
  })
  if (!user?.player) {
    return NextResponse.json({ error: "No player" }, { status: 400 })
  }

  const playerId = user.player.id
  const now = new Date()

  try {
    const result = await prisma.$transaction(async (tx) => {
      // ✅ 1) Met à jour pendingBalance + pendingEarned des items
      await settlePending(tx, playerId)

      // ✅ 2) Lire le pendingBalance à claim
      const p = await tx.player.findUnique({
        where: { id: playerId },
        select: { balance: true, pendingBalance: true },
      })
      if (!p) throw new Error("Player not found")

      const pending = safeNum(p.pendingBalance, 0)

      // ✅ 3) Créditer balance + reset pendingBalance + update lastClaimedAt
      await tx.player.update({
        where: { id: playerId },
        data: {
          balance: { increment: pending },
          pendingBalance: 0,
          lastClaimedAt: now,
        },
      })

      // ✅ 4) Reset pendingEarned sur TOUS les items du joueur
      await tx.playerItem.updateMany({
        where: { playerId },
        data: { pendingEarned: 0 },
      })

      const p2 = await tx.player.findUnique({
        where: { id: playerId },
        select: { balance: true, lastClaimedAt: true },
      })

      return {
        ok: true,
        claimed: pending,
        balance: p2?.balance ?? 0,
        lastClaimedAt: p2?.lastClaimedAt?.toISOString() ?? now.toISOString(),
      }
    })

    return NextResponse.json(result)
  } catch (e: any) {
    console.error("CLAIM API ERROR:", e)
    return NextResponse.json({ error: e?.message ?? "Claim error" }, { status: 500 })
  }
}
