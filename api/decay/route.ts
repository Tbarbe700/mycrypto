import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/src/lib/prisma"
import { settlePending } from "@/src/lib/settlePending"

const DECAY_INTERVAL_SEC = 60 // 1 min
const DECAY_HP_PER_TICK = 10  // -10 HP par tick

function safeNum(x: any, fallback = 0) {
  const n = typeof x === "number" ? x : Number(x)
  return Number.isFinite(n) ? n : fallback
}

export async function POST() {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { player: true },
  })
  if (!user?.player) return NextResponse.json({ error: "No player" }, { status: 400 })

  const playerId = user.player.id
  const now = new Date()

  try {
    const out = await prisma.$transaction(async (tx) => {
      // ✅ 1) fige le pending avant tout changement
      await settlePending(tx, playerId)

      // ✅ 2) IMPORTANT : on ne prend QUE les items équipés
      const equippedItems = await tx.playerItem.findMany({
        where: { playerId, equipped: true },
        select: { id: true, hp: true, lastItemDecayAt: true },
      })

      // Si rien d'équipé -> rien ne bouge (timer + hp)
      if (equippedItems.length === 0) {
        return { ok: true, ticks: 0, reason: "no equipped items" }
      }

      let totalTicks = 0

      // ✅ 3) Dégradation par item (timer indépendant)
      for (const it of equippedItems) {
        const last = it.lastItemDecayAt > now ? now : it.lastItemDecayAt
        const elapsedSec = Math.max(0, (now.getTime() - last.getTime()) / 1000)
        const ticks = Math.floor(elapsedSec / DECAY_INTERVAL_SEC)

        if (ticks <= 0) continue
        totalTicks += ticks

        const loss = ticks * DECAY_HP_PER_TICK
        const currentHp = safeNum(it.hp, 0)
        const newHp = Math.max(0, Math.min(100, currentHp - loss))

        // On avance le timer seulement si l'item est équipé
        const advancedMs = last.getTime() + ticks * DECAY_INTERVAL_SEC * 1000
        const advancedAt = new Date(advancedMs)

        await tx.playerItem.update({
          where: { id: it.id },
          data: {
            hp: newHp,
            lastItemDecayAt: advancedAt,
          },
        })
      }

      return {
        ok: true,
        ticks: totalTicks,
        intervalSec: DECAY_INTERVAL_SEC,
        lossPerTick: DECAY_HP_PER_TICK,
      }
    })

    return NextResponse.json(out)
  } catch (e: any) {
    console.error("DECAY ERROR:", e)
    return NextResponse.json({ error: e?.message ?? "Decay error" }, { status: 500 })
  }
}
