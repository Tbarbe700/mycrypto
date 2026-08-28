// app/inventory-v2/page.tsx
import { auth } from "@/auth"
import { prisma } from "@/src/lib/prisma"
import { redirect } from "next/navigation"

import InventoryClient from "./InventoryClient"

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

  // ✅ TS-friendly: on verrouille character en non-null
  const character = user.player.character
  if (!character) redirect("/choose-character")

  const player = user.player
  const slotMax = slotsForLevel(player.level)

  const equippedDb = player.items.filter((x: any) => x.equipped)
  const inventoryDb = player.items.filter((x: any) => !x.equipped)

  const gainPerSec = equippedDb.reduce((sum: number, pi: any) => sum + gainFor(pi.item.baseRate, pi.hp), 0)
  const nextUpgradeCost = player.level >= MAX_LEVEL ? null : upgradeCost(player.level)

  const toUI = (pi: any) => ({
    id: String(pi.id),
    equipped: Boolean(pi.equipped),
    hp: Number(pi.hp) || 0,
    pendingEarned: safeNum(pi.pendingEarned, 0),
    lastItemDecayAtIso: pi.lastItemDecayAt ? new Date(pi.lastItemDecayAt).toISOString() : null,
    item: {
      name: String(pi.item?.name ?? "Unknown"),
      rarity: String(pi.item?.rarity ?? "COMMON"),
      baseRate: safeNum(pi.item?.baseRate, 0),
      runeType: pi.item?.runeType ? String(pi.item.runeType) : null, // ✅ AJOUT
    },
  })

  return (
    <InventoryClient
      player={{
        level: player.level,
        character, // ✅ string garanti ici
        pendingBalance: safeNum(player.pendingBalance, 0),
        lastClaimedAtIso: player.lastClaimedAt.toISOString(),
        slotMax,
      }}
      gainPerSec={gainPerSec}
      nextUpgradeCost={nextUpgradeCost}
      equipped={equippedDb.map(toUI)}
      inventory={inventoryDb.map(toUI)}
    />
  )
}