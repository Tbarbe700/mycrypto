import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/src/lib/prisma"

export async function GET() {
  const session = await auth()

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const email = session.user.email
  const name = session.user.name ?? null
  const image = session.user.image ?? null

  // 1) Upsert User
  const user = await prisma.user.upsert({
    where: { email },
    update: { name, image },
    create: { email, name, image },
  })

  // 2) Create player if missing
  let player = await prisma.player.findUnique({ where: { userId: user.id } })

  if (!player) {
    const now = new Date()
    player = await prisma.player.create({
      data: {
        userId: user.id,
        level: 1,
        balance: 0,
        pendingBalance: 0,
        character: null,
        lastClaimedAt: now,
        lastDecayAt: now,
      },
    })
  }

  return NextResponse.json({ user, player })
}
