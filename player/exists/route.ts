import { NextResponse } from "next/server"
import { prisma } from "@/src/lib/prisma"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const wallet = searchParams.get("wallet")?.trim()

    if (!wallet) {
      return NextResponse.json({ hasCharacter: false }, { status: 200 })
    }

    const player = await prisma.player.findFirst({
      where: { solanaWallet: wallet },
      select: { id: true },
    })

    return NextResponse.json({ hasCharacter: Boolean(player) }, { status: 200 })
  } catch (e) {
    console.error("GET /api/player/exists failed:", e)
    return NextResponse.json(
      { hasCharacter: false, error: "server_error" },
      { status: 500 }
    )
  }
}
