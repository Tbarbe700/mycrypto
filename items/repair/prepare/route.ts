// app/api/items/repair/prepare/route.ts

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

function rarityMult(rarity: string) {
  switch (rarity) {
    case "EPIC":
      return 4
    case "RARE":
      return 2
    default:
      return 1
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

  // wallet Phantom lié (celui qui doit payer)
  const payerWallet = user.player.solanaWallet
  if (!payerWallet) {
    return NextResponse.json({ ok: false, error: "WALLET_NOT_LINKED" }, { status: 400 })
  }

  // Env unifiés
  const rpc = SOLANA_RPC_SERVER
  const mint = TOKEN_MINT
  const treasury = TREASURY_WALLET
  const decimals = TOKEN_DECIMALS

  if (!mint) {
    return NextResponse.json({ ok: false, error: "MINT_NOT_SET" }, { status: 500 })
  }
  if (!treasury) {
    return NextResponse.json({ ok: false, error: "TREASURY_NOT_SET" }, { status: 500 })
  }

  const playerId = user.player.id

  try {
    // calc coût en DB (ne modifie rien, sauf settlePending pour figer)
    const out = await prisma.$transaction(async (tx) => {
      await settlePending(tx, playerId)

      const pi = await tx.playerItem.findFirst({
        where: { id: playerItemId, playerId },
        include: { item: true },
      })
      if (!pi) return { ok: false as const, status: 404, error: "Item not found" }

      const hp = Math.max(0, Math.min(100, Number(pi.hp) || 0))
      if (hp >= 100) return { ok: false as const, status: 400, error: "Item déjà à 100%" }

      const missing = 100 - hp
      const mult = rarityMult(pi.item.rarity)

      // ✅ FORMULE SOURCE DE VÉRITÉ (API)
      const costUi = Math.ceil(missing * mult)

      const amountRaw = BigInt(costUi) * pow10(decimals)

      // ATAs (on les renvoie au front)
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
        meta: { hp, missing, mult, equipped: pi.equipped, rarity: pi.item.rarity },
      }
    })

    if ((out as any).ok === false) {
      return NextResponse.json({ ok: false, error: (out as any).error }, { status: (out as any).status ?? 400 })
    }

    // ✅ CHECK treasury ATA côté serveur (plus de getAccountInfo navigateur => plus de 403 ici)
    const connection = new Connection(rpc, "confirmed")
    const treasuryAtaPk = new PublicKey((out as any).treasuryAta)
    const treasuryInfo = await connection.getAccountInfo(treasuryAtaPk)

    return NextResponse.json({
      ...(out as any),
      treasuryAtaExists: !!treasuryInfo,
    })
  } catch (e: any) {
    console.error("REPAIR PREPARE ERROR:", e)
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Prepare repair error" },
      { status: 500 }
    )
  }
}
