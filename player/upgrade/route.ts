import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/src/lib/prisma"

const MAX_LEVEL = 10

function upgradeCost(currentLevel: number) {
  // coût pour passer du level current -> current+1
  // lvl1->2 = 50, lvl2->3 = 80, lvl3->4 = 128 ...
  return Math.round(50 * Math.pow(1.6, currentLevel - 1))
}

export async function POST(req: Request) {
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

  const player = user.player
  if (player.level >= MAX_LEVEL) {
    return NextResponse.json({ error: "Max level reached" }, { status: 400 })
  }

  const cost = upgradeCost(player.level)

  if (player.balance < cost) {
    return NextResponse.json(
      { error: "Not enough balance", cost, balance: player.balance, level: player.level },
      { status: 400 }
    )
  }

  const updated = await prisma.player.update({
    where: { id: player.id },
    data: {
      level: { increment: 1 },
      balance: { decrement: cost },
    },
    select: { level: true, balance: true },
  })

  const nextCost = updated.level >= MAX_LEVEL ? null : upgradeCost(updated.level)

  return NextResponse.json({
    level: updated.level,
    balance: updated.balance,
    spent: cost,
    nextCost,
  })
}
