import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/src/lib/prisma"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  const form = await req.formData()
  const character = String(form.get("character") ?? "")

  const allowed = new Set(["perso1", "perso2", "perso3"])
  if (!allowed.has(character)) {
    return NextResponse.redirect(new URL("/choose-character", req.url))
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { player: true },
  })

  if (!user?.player) {
    return NextResponse.redirect(new URL("/api/me", req.url))
  }

  // Empêcher de changer si déjà choisi
  if (user.player.character) {
    return NextResponse.redirect(new URL("/", req.url))
  }

  await prisma.player.update({
    where: { userId: user.id },
    data: { character },
  })

  return NextResponse.redirect(new URL("/", req.url))
}
