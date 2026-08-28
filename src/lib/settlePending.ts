function clamp01(x: number) {
  return Math.max(0, Math.min(1, x))
}

function safeNum(x: any, fallback = 0) {
  const n = typeof x === "number" ? x : Number(x)
  return Number.isFinite(n) ? n : fallback
}

function gainFor(baseRate: number, hp: number) {
  const br = safeNum(baseRate, 0)
  const h = safeNum(hp, 0)
  return br * clamp01(h / 100)
}

/**
 * Ajoute ce qui a été gagné depuis lastClaimedAt dans pendingBalance (joueur)
 * ET répartit la partie gagnée sur chaque item équipé (pendingEarned).
 */
export async function settlePending(tx: any, playerId: string) {
  const player = await tx.player.findUnique({
    where: { id: playerId },
    include: {
      items: { where: { equipped: true }, include: { item: true } },
    },
  })
  if (!player) throw new Error("Player not found")

  const now = new Date()
  const last = player.lastClaimedAt > now ? now : player.lastClaimedAt
  const elapsedSec = Math.max(0, (now.getTime() - last.getTime()) / 1000)

  if (elapsedSec <= 0) return { delta: 0, gainPerSec: 0, elapsedSec: 0 }

  const gains = player.items.map((pi: any) => {
    const g = gainFor(pi.item.baseRate, pi.hp)
    return { id: pi.id, gainPerSec: g }
  })

  const totalGainPerSec = gains.reduce((s: number, x: any) => s + x.gainPerSec, 0)
  if (totalGainPerSec <= 0) {
    // rien à distribuer, on avance juste lastClaimedAt
    await tx.player.update({
      where: { id: playerId },
      data: { lastClaimedAt: now },
    })
    return { delta: 0, gainPerSec: 0, elapsedSec }
  }

  const delta = totalGainPerSec * elapsedSec

  // 1) pending global joueur
  await tx.player.update({
    where: { id: playerId },
    data: {
      pendingBalance: { increment: delta },
      lastClaimedAt: now,
    },
  })

  // 2) pending par item (répartition prorata)
  for (const g of gains) {
    if (g.gainPerSec <= 0) continue
    const share = (g.gainPerSec / totalGainPerSec) * delta

    await tx.playerItem.update({
      where: { id: g.id },
      data: { pendingEarned: { increment: share } },
    })
  }

  return { delta, gainPerSec: totalGainPerSec, elapsedSec }
}
