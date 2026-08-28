import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/src/lib/prisma"
import { settlePending } from "@/src/lib/settlePending"

const MAX_LEVEL = 10
const DECAY_INTERVAL_SEC = 60 // ⚠️ doit matcher ton decay timer serveur

function slotsForLevel(level: number) {
  return Math.min(Math.max(level, 1), MAX_LEVEL)
}

function safeInt(x: any, fallback: number) {
  const n = typeof x === "number" ? x : Number(x)
  return Number.isFinite(n) ? Math.floor(n) : fallback
}

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

  try {
    await prisma.$transaction(async (tx) => {
      // ✅ 1) Figer pending avant de changer l’équipement
      await settlePending(tx, playerId)

      const now = new Date()

      const player = await tx.player.findUnique({
        where: { id: playerId },
        select: { id: true, level: true },
      })
      if (!player) throw new Error("Player not found")

      // ✅ charge l’item avec decayCarrySec + lastItemDecayAt
      const pi = await tx.playerItem.findFirst({
        where: { id: playerItemId, playerId },
        select: {
          id: true,
          equipped: true,
          hp: true,
          decayCarrySec: true,
          lastItemDecayAt: true,
        },
      })
      if (!pi) throw new Error("Item not found")

      // déjà équipé -> rien
      if (pi.equipped) return

      // slots dispo ?
      const slotMax = slotsForLevel(player.level)
      const equipped = await tx.playerItem.findMany({
        where: { playerId, equipped: true },
        select: { id: true, createdAt: true },
        orderBy: { createdAt: "asc" }, // le plus ancien
      })

      // ✅ Si slots pleins: échange (auto-unequip 1)
      if (equipped.length >= slotMax && equipped.length > 0) {
        await tx.playerItem.update({
          where: { id: equipped[0].id },
          data: { equipped: false },
        })
      }

      // ✅ Si l’item est à 0 HP, on peut l’équiper mais son timer doit rester à 0 côté UI (DecayTimer gère ça)
      // ✅ Restore timer : si decayCarrySec null => timer full
      const carry = Math.max(
        0,
        Math.min(
          DECAY_INTERVAL_SEC,
          safeInt(pi.decayCarrySec, DECAY_INTERVAL_SEC) // 🔥 jamais null
        )
      )

      // lastItemDecayAt doit être tel que "remaining = carry"
      // remaining = (lastItemDecayAt + interval) - now
      // => lastItemDecayAt = now - (interval - carry)
      const restoredLastMs = now.getTime() - (DECAY_INTERVAL_SEC - carry) * 1000
      const restoredLast = new Date(restoredLastMs)

      await tx.playerItem.update({
        where: { id: pi.id },
        data: {
          equipped: true,
          lastItemDecayAt: restoredLast,
          decayCarrySec: 0, // ✅ IMPORTANT: jamais null
        },
      })
    })
  } catch (e) {
    console.error("EQUIP ERROR:", e)
  }

  return NextResponse.redirect(new URL("/inventory", req.url))
}
