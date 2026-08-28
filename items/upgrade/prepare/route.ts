import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/src/lib/prisma"
import { settlePending } from "@/src/lib/settlePending"
import { Connection, PublicKey } from "@solana/web3.js"
import { getAssociatedTokenAddress } from "@solana/spl-token"
import {
  SOLANA_RPC_SERVER,
  TOKEN_MINT,
  TREASURY_WALLET,
  TOKEN_DECIMALS,
} from "@/src/lib/solana/constants"

function upgradeCostForRarity(rarity: string) {
  // ✅ Mets ici LA formule source de vérité (aligne avec ton UI ensuite)
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

function pow10(decimals: number): bigint {
  let p = BigInt(1)
  const ten = BigInt(10)
  for (let i = 0; i < decimals; i++) p = p * ten
  return p
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const playerItemId = String(body?.playerItemId ?? "")
  if (!playerItemId) {
    return NextResponse.json({ ok: false, error: "Missing playerItemId" }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { player: true },
  })
  if (!user?.player) {
    return NextResponse.json({ ok: false, error: "No player" }, { status: 400 })
  }

  const payerWallet = user.player.solanaWallet
  if (!payerWallet) {
    return NextResponse.json({ ok: false, error: "WALLET_NOT_LINKED" }, { status: 400 })
  }

  const rpc = SOLANA_RPC_SERVER
  const mint = TOKEN_MINT
  const treasury = TREASURY_WALLET
  const decimals = TOKEN_DECIMALS

  if (!mint) return NextResponse.json({ ok: false, error: "MINT_NOT_SET" }, { status: 500 })
  if (!treasury) return NextResponse.json({ ok: false, error: "TREASURY_NOT_SET" }, { status: 500 })

  const playerId = user.player.id

  try {
    const out = await prisma.$transaction(async (tx) => {
      await settlePending(tx, playerId)

      const pi = await tx.playerItem.findFirst({
        where: { id: playerItemId, playerId },
        include: { item: true },
      })
      if (!pi) return { ok: false as const, status: 404, error: "Item not found" }

      // ✅ ici tu peux ajouter des règles: max level, pas upgrade si pending, etc.
      // Exemple (si tu as un champ pi.level) :
      // if (pi.level >= 10) return { ok: false as const, status: 400, error: "MAX_LEVEL" }

      const costUi = upgradeCostForRarity(pi.item.rarity)
      const amountRaw = BigInt(costUi) * pow10(decimals)

      const mintPk = new PublicKey(mint)
      const payerPk = new PublicKey(payerWallet)
      const treasuryPk = new PublicKey(treasury)

      const payerAta = await getAssociatedTokenAddress(mintPk, payerPk)
      const treasuryAta = await getAssociatedTokenAddress(mintPk, treasuryPk)

      return {
        ok: true as const,
        playerItemId,
        costUi,
        amountRaw: amountRaw.toString(),
        decimals,
        mint,
        treasury,
        payerWallet,
        payerAta: payerAta.toBase58(),
        treasuryAta: treasuryAta.toBase58(),
        meta: { rarity: pi.item.rarity },
      }
    })

    if ((out as any).ok === false) {
      return NextResponse.json({ ok: false, error: (out as any).error }, { status: (out as any).status ?? 400 })
    }

    // ✅ Check ATA treasury côté serveur (évite getAccountInfo navigateur => évite 403)
    const connection = new Connection(rpc, "confirmed")
    const treasuryInfo = await connection.getAccountInfo(new PublicKey((out as any).treasuryAta))

    return NextResponse.json({
      ...(out as any),
      treasuryAtaExists: !!treasuryInfo,
    })
  } catch (e: any) {
    console.error("UPGRADE PREPARE ERROR:", e)
    return NextResponse.json({ ok: false, error: e?.message ?? "Upgrade prepare error" }, { status: 500 })
  }
}
