// app/swap/page.tsx
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import SwapHudClient from "./SwapHudClient"

export default async function SwapPage() {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")

  // Si tu veux aussi forcer le wallet/character comme sur inventory-v2,
  // on pourra ajouter prisma + checks ici. Pour l’instant: accès login only.

  return <SwapHudClient />
}
