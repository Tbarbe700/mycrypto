import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/src/lib/prisma"
import { settlePending } from "@/src/lib/settlePending"
import { PublicKey } from "@solana/web3.js"
import { getAssociatedTokenAddress } from "@solana/spl-token"

function getEnv(name: string) {
  const v = process.env[name]
  if (!v) throw new Error(`ENV missing: ${name}`)
  return v
}

function pow10(decimals: number): bigint {
  let p = BigInt(1)
  const ten = BigInt(10)
  for (let i = 0; i < decimals; i++) p = p * ten
  return p
}

function upgradeCost(level: number) {
  // même logique que ton inventory/page.tsx
  return Math.round(50 * Math.pow(1.6, Math.max(1, level) - 1))
}

export async function POST() {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { player: true },
  })
  if (!user?.player) return NextResponse.json({ ok: false, error: "No player" }, { status: 400 })

  const payerWallet = user.player.solanaWallet
  if (!payerWallet) return NextResponse.json({ ok: false, error: "WALLET_NOT_LINKED" }, { status: 400 })

  const mint = getEnv("SOLANA_TOKEN_MINT")
  const treasury = getEnv("SOLANA_TREASURY_SOL")
  const decimals = Number(process.env.SOLANA_TOKEN_DECIMALS ?? 9)

  // fige les gains avant l’upgrade (cohérence)
  await prisma.$transaction(async (tx) => {
    await settlePending(tx, user.player!.id)
  })

  const level = user.player.level ?? 1
  const costUi = upgradeCost(level)
  const amountRaw = BigInt(costUi) * pow10(decimals)

  const mintPk = new PublicKey(mint)
  const payerPk = new PublicKey(payerWallet)
  const treasuryPk = new PublicKey(treasury)

  const payerAta = await getAssociatedTokenAddress(mintPk, payerPk)
  const treasuryAta = await getAssociatedTokenAddress(mintPk, treasuryPk)

  return NextResponse.json({
    ok: true,
    costUi,
    amountRaw: amountRaw.toString(),
    decimals,
    mint,
    treasury,
    payerWallet,
    payerAta: payerAta.toBase58(),
    treasuryAta: treasuryAta.toBase58(),
    meta: { level },
  })
}
