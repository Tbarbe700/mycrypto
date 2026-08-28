import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/src/lib/prisma"
import { settlePending } from "@/src/lib/settlePending"
import { Connection, PublicKey } from "@solana/web3.js"

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

function sumOwnerMint(balances: any[] | undefined, mint: string, owner: string): bigint {
  if (!balances?.length) return BigInt(0)
  let sum = BigInt(0)
  for (const b of balances) {
    if (b?.mint !== mint) continue
    if (b?.owner !== owner) continue
    const rawStr = b?.uiTokenAmount?.amount
    if (!rawStr) continue
    try {
      sum += BigInt(rawStr)
    } catch {}
  }
  return sum
}

function upgradeCost(level: number) {
  return Math.round(50 * Math.pow(1.6, Math.max(1, level) - 1))
}

async function verifyPayment(opts: {
  signature: string
  payer: string
  treasury: string
  mint: string
  expectedRaw: bigint
  rpc: string
}) {
  const { signature, payer, treasury, mint, expectedRaw, rpc } = opts
  const connection = new Connection(rpc, "confirmed")

  const tx = await connection.getParsedTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  })

  if (!tx) return { ok: false as const, error: "TX_NOT_FOUND" }
  if (tx.meta?.err) return { ok: false as const, error: "TX_FAILED" }

  const payerPk = new PublicKey(payer).toBase58()
  const treasuryPk = new PublicKey(treasury).toBase58()
  const mintPk = new PublicKey(mint).toBase58()

  const signers = (tx.transaction.message.accountKeys as any[])
    .filter((k) => !!k?.signer)
    .map((k) => (k?.pubkey?.toBase58?.() ?? k?.toBase58?.() ?? ""))

  if (!signers.includes(payerPk)) {
    return { ok: false as const, error: "PAYER_NOT_SIGNER", debug: { payer: payerPk, signers } }
  }

  const pre = tx.meta?.preTokenBalances ?? []
  const post = tx.meta?.postTokenBalances ?? []

  const preTreasury = sumOwnerMint(pre, mintPk, treasuryPk)
  const postTreasury = sumOwnerMint(post, mintPk, treasuryPk)
  const deltaTreasury = postTreasury - preTreasury

  if (deltaTreasury !== expectedRaw) {
    return {
      ok: false as const,
      error: "PAYMENT_NOT_VERIFIED",
      debug: {
        expectedRaw: expectedRaw.toString(),
        deltaTreasury: deltaTreasury.toString(),
        mint: mintPk,
        payer: payerPk,
        treasury: treasuryPk,
      },
    }
  }

  return { ok: true as const }
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  const signature = String(body?.signature ?? "")
  if (!signature) return NextResponse.json({ ok: false, error: "Missing signature" }, { status: 400 })

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { player: true },
  })
  if (!user?.player) return NextResponse.json({ ok: false, error: "No player" }, { status: 400 })

  const playerId = user.player.id
  const payerWallet = user.player.solanaWallet
  if (!payerWallet) return NextResponse.json({ ok: false, error: "WALLET_NOT_LINKED" }, { status: 400 })

  const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC || process.env.SOLANA_RPC || "https://api.devnet.solana.com"
  const mint = getEnv("SOLANA_TOKEN_MINT")
  const treasury = getEnv("SOLANA_TREASURY_SOL")
  const decimals = Number(process.env.SOLANA_TOKEN_DECIMALS ?? 9)

  try {
    const out = await prisma.$transaction(async (tx) => {
      // anti replay signature
      const already = await tx.purchaseTx.findUnique({ where: { signature } })
      if (already) return { ok: false as const, status: 400, error: "SIGNATURE_ALREADY_USED" }

      await settlePending(tx, playerId)

      const player = await tx.player.findUnique({ where: { id: playerId } })
      if (!player) return { ok: false as const, status: 404, error: "PLAYER_NOT_FOUND" }

      const level = player.level ?? 1
      const costUi = upgradeCost(level)
      const expectedRaw = BigInt(costUi) * pow10(decimals)

      const ver = await verifyPayment({
        signature,
        payer: payerWallet,
        treasury,
        mint,
        expectedRaw,
        rpc,
      })

      if (!ver.ok) {
        console.error("verifyPayment player upgrade failed:", ver)
        return { ok: false as const, status: 400, error: ver.error, debug: (ver as any).debug }
      }

      // apply upgrade
      const nextLevel = level + 1
      const updated = await tx.player.update({
        where: { id: playerId },
        data: { level: nextLevel },
      })

      // log purchase
      await tx.purchaseTx.create({
        data: {
          signature,
          payerWallet,
          kind: "PLAYER_UPGRADE",
          chest: null,
          mint,
          amountRaw: expectedRaw.toString(), // string -> safe
          amountMac: costUi,
          amountUi: costUi,
          userId: user.id,
        },
      })

      return { ok: true as const, level: updated.level, costUi, signature }
    })

    if ((out as any).ok === false) {
      return NextResponse.json(
        { ok: false, error: (out as any).error, debug: (out as any).debug },
        { status: (out as any).status ?? 400 }
      )
    }

    return NextResponse.json(out)
  } catch (e: any) {
    console.error("PLAYER UPGRADE FINALIZE ERROR:", e)
    return NextResponse.json({ ok: false, error: e?.message ?? "Upgrade error" }, { status: 500 })
  }
}
