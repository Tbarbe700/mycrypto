// app/farm/page.tsx
import { auth } from "@/auth"
import { prisma } from "@/src/lib/prisma"
import { redirect } from "next/navigation"

import InventoryHudClient from "./InventoryHudClient"

const MAX_LEVEL = 10

function slotsForLevel(level: number) {
  return Math.min(Math.max(level, 1), MAX_LEVEL)
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x))
}

function gainFor(baseRate: number, hp: number) {
  const br = Number(baseRate) || 0
  const h = Number(hp) || 0
  return br * clamp01(h / 100)
}

function upgradeCost(currentLevel: number) {
  return Math.round(50 * Math.pow(1.6, currentLevel - 1))
}

function safeNum(x: any, fallback = 0) {
  const n = typeof x === "number" ? x : Number(x)
  return Number.isFinite(n) ? n : fallback
}

export default async function InventoryV2Page() {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: {
      player: {
        include: {
          items: { include: { item: true }, orderBy: { createdAt: "desc" } },
        },
      },
    },
  })

  if (!user?.player) redirect("/api/me")

  const character = user.player.character
  if (!character) redirect("/choose-character")

  const player = user.player
  const slotMax = slotsForLevel(player.level)

  const equippedRaw = player.items.filter((x: any) => x.equipped)
  const inventoryRaw = player.items.filter((x: any) => !x.equipped)

  const gainPerSec = equippedRaw.reduce((sum: number, pi: any) => sum + gainFor(pi.item.baseRate, pi.hp), 0)
  const nextUpgradeCost = player.level >= MAX_LEVEL ? null : upgradeCost(player.level)
  const lastClaimedAtIso = player.lastClaimedAt.toISOString()

  const serialize = (pi: any) => ({
    id: String(pi.id),
    equipped: Boolean(pi.equipped),
    hp: Number(pi.hp) || 0,
    pendingEarned: safeNum(pi.pendingEarned, 0),
    lastItemDecayAtIso: pi.lastItemDecayAt?.toISOString?.() ?? null,
    item: {
      name: String(pi.item?.name ?? ""),
      rarity: String(pi.item?.rarity ?? "COMMON"),
      baseRate: safeNum(pi.item?.baseRate, 0),
      // ⚠️ si tu as runeType côté item, tu peux l’ajouter ici plus tard
      // runeType: pi.item?.runeType ?? null,
    },
  })

  const equipped = equippedRaw.map(serialize)
  const inventory = inventoryRaw.map(serialize)

  return (
    <InventoryHudClient
      player={{
        level: player.level,
        character,
        pendingBalance: safeNum(player.pendingBalance, 0),
        lastClaimedAtIso,
        slotMax,
      }}
      gainPerSec={gainPerSec}
      nextUpgradeCost={nextUpgradeCost}
      equipped={equipped}
      inventory={inventory}
    />
  )
}