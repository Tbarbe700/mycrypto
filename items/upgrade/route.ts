import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/src/lib/prisma"
import { ItemRarity } from "@prisma/client"
import { settlePending } from "@/src/lib/settlePending"

type Rarity = ItemRarity

function getUpgradeRule(rarity: Rarity) {
  switch (rarity) {
    case "COMMON":
      return { successChance: 0.1, target: "RARE" as Rarity }
    case "RARE":
      return { successChance: 0.1, target: "EPIC" as Rarity }
    case "EPIC":
      return null
    default:
      return null
  }
}

function upgradeCost(rarity: Rarity) {
  switch (rarity) {
    case "COMMON":
      return 25
    case "RARE":
      return 75
    case "EPIC":
      return 200
    default:
      return 50
  }
}

function safeNum(x: any, fallback = 0) {
  const n = typeof x === "number" ? x : Number(x)
  return Number.isFinite(n) ? n : fallback
}

function rand01() {
  return Math.random()
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const form = await req.formData()
  const playerItemId = String(form.get("playerItemId") || "")
  if (!playerItemId) {
    return NextResponse.json({ error: "Missing playerItemId" }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { player: true },
  })
  if (!user?.player) {
    return NextResponse.json({ error: "No player" }, { status: 400 })
  }

  const playerId = user.player.id

  try {
    const result = await prisma.$transaction(async (tx) => {
      // ✅ 0) Figer le pending AVANT toute opération (HP/claim/pendingEarned)
      await settlePending(tx, playerId)

      // ✅ 1) Recharger l'item DANS la tx (plus safe)
      const pi = await tx.playerItem.findFirst({
        where: { id: playerItemId, playerId },
        include: { item: true },
      })
      if (!pi) {
        return { ok: false as const, status: 404 as const, error: "Item not found" }
      }

      // ✅ 2) sécurité : item équipé => pas upgradable
      if (pi.equipped) {
        return {
          ok: false as const,
          status: 400 as const,
          error: "Impossible d'upgrade un item équipé",
        }
      }

      // ✅ 3) sécurité : pendingEarned > 0 => pas upgradable
      const pendingEarned = safeNum((pi as any).pendingEarned, 0)
      if (pendingEarned > 0) {
        return {
          ok: false as const,
          status: 400 as const,
          error: "Impossible d'upgrade : l'item a du gain en attente. Claim & Vendre d'abord.",
          pendingEarned,
        }
      }

      const rarity = pi.item.rarity as Rarity
      const rule = getUpgradeRule(rarity)
      if (!rule) {
        return {
          ok: false as const,
          status: 400 as const,
          error: "Cet item ne peut pas être upgradé",
        }
      }

      const cost = upgradeCost(rarity)

      // roll dans la tx (OK)
      const roll = rand01()
      const success = roll < rule.successChance

      // ✅ 4) Vérif balance + débit
      const player = await tx.player.findUnique({
        where: { id: playerId },
        select: { balance: true },
      })
      if (!player) throw new Error("Player not found")

      if (player.balance < cost) {
        return {
          ok: false as const,
          status: 400 as const,
          error: "Balance insuffisante",
          cost,
          balance: player.balance,
        }
      }

      await tx.player.update({
        where: { id: playerId },
        data: { balance: { decrement: cost } },
      })

      // ✅ 5) consommer l'item (perdu dans tous les cas)
      await tx.playerItem.delete({ where: { id: pi.id } })

      if (!success) {
        const p2 = await tx.player.findUnique({
          where: { id: playerId },
          select: { balance: true },
        })

        return {
          ok: true as const,
          success: false as const,
          newItem: null,
          cost,
          balance: p2?.balance ?? 0,
          roll,
          chance: rule.successChance,
        }
      }

      // ✅ 6) choisir un item target au hasard
      const candidates = await tx.item.findMany({
        where: { rarity: rule.target },
        select: { id: true },
      })
      if (candidates.length === 0) {
        throw new Error(`Aucun item ${rule.target} disponible dans la base`)
      }

      const picked = candidates[Math.floor(Math.random() * candidates.length)]

      // ✅ 7) donner le nouvel item (HP max, non équipé par construction ici)
      const created = await tx.playerItem.create({
        data: {
          playerId,
          itemId: picked.id,
          hp: 100,
          equipped: false,
          pendingEarned: 0,
          // si tu as lastItemDecayAt/decayCarrySec dans ton schema :
          // lastItemDecayAt: new Date(),
          // decayCarrySec: null,
        },
        include: { item: true },
      })

      const p2 = await tx.player.findUnique({
        where: { id: playerId },
        select: { balance: true },
      })

      return {
        ok: true as const,
        success: true as const,
        newItem: created,
        cost,
        balance: p2?.balance ?? 0,
        roll,
        chance: rule.successChance,
      }
    })

    // Gestion des retours "soft" (pas throw)
    if ((result as any).ok === false) {
      return NextResponse.json(
        { error: (result as any).error, ...(result as any) },
        { status: (result as any).status ?? 400 }
      )
    }

    return NextResponse.json(result)
  } catch (e: any) {
    console.error("UPGRADE ERROR:", e)
    return NextResponse.json({ error: e?.message ?? "Upgrade error" }, { status: 500 })
  }
}
