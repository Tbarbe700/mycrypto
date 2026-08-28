// app/api/items/repair/finalize/route.ts

import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/src/lib/prisma"
import { settlePending } from "@/src/lib/settlePending"
import { Connection, PublicKey } from "@solana/web3.js"
import {
  SOLANA_RPC_SERVER,
  TOKEN_MINT,
  TREASURY_WALLET,
  TOKEN_DECIMALS,
} from "@/src/lib/solana/constants"

const DECAY_INTERVAL_SEC = 60

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

  // payer doit être signer
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
    const prePayer = sumOwnerMint(pre, mintPk, payerPk)
    const postPayer = sumOwnerMint(post, mintPk, payerPk)
    const deltaPayer = postPayer - prePayer

    return {
      ok: false as const,
      error: "PAYMENT_NOT_VERIFIED",
      debug: {
        expectedRaw: expectedRaw.toString(),
        deltaTreasury: deltaTreasury.toString(),
        deltaPayer: deltaPayer.toString(),
        mint: mintPk,
        payer: payerPk,
        treasury: treasuryPk,
      },
    }
  }

  return { ok: true as const }
}

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

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const playerItemId = String(body?.playerItemId ?? "")
  const signature = String(body?.signature ?? "")

  if (!playerItemId) return NextResponse.json({ ok: false, error: "Missing playerItemId" }, { status: 400 })
  if (!signature) return NextResponse.json({ ok: false, error: "Missing signature" }, { status: 400 })

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { player: true },
  })
  if (!user?.player) return NextResponse.json({ ok: false, error: "No player" }, { status: 400 })

  const playerId = user.player.id
  const payerWallet = user.player.solanaWallet
  if (!payerWallet) return NextResponse.json({ ok: false, error: "WALLET_NOT_LINKED" }, { status: 400 })

  const rpc = SOLANA_RPC_SERVER
  const mint = TOKEN_MINT
  const treasury = TREASURY_WALLET
  const decimals = TOKEN_DECIMALS

  if (!mint) return NextResponse.json({ ok: false, error: "MINT_NOT_SET" }, { status: 500 })
  if (!treasury) return NextResponse.json({ ok: false, error: "TREASURY_NOT_SET" }, { status: 500 })

  try {
    const out = await prisma.$transaction(async (tx) => {
      // anti replay
      const already = await tx.purchaseTx.findUnique({ where: { signature } })
      if (already) return { ok: false as const, status: 400, error: "SIGNATURE_ALREADY_USED" }

      // fige pending
      await settlePending(tx, playerId)

      // reload item
      const pi = await tx.playerItem.findFirst({
        where: { id: playerItemId, playerId },
        include: { item: true },
      })
      if (!pi) return { ok: false as const, status: 404, error: "Item not found" }

      const hp = Math.max(0, Math.min(100, Number(pi.hp) || 0))
      if (hp >= 100) return { ok: false as const, status: 400, error: "Item déjà à 100%" }

      // ✅ même formule que prepare
      const missing = 100 - hp
      const mult = rarityMult(pi.item.rarity)
      const costUi = Math.ceil(missing * mult)
      const expectedRaw = BigInt(costUi) * pow10(decimals)

      // verify on-chain payment
      const ver = await verifyPayment({
        signature,
        payer: payerWallet,
        treasury,
        mint,
        expectedRaw,
        rpc,
      })

      if (!ver.ok) {
        console.error("verifyPayment repair failed:", ver)
        return { ok: false as const, status: 400, error: ver.error, debug: (ver as any).debug }
      }

      // apply repair
      const now = new Date()
      const nextCarry = pi.equipped ? 0 : DECAY_INTERVAL_SEC

      const updatedItem = await tx.playerItem.update({
        where: { id: playerItemId },
        data: {
          hp: 100,
          lastItemDecayAt: now,
          decayCarrySec: nextCarry,
        },
        include: { item: true },
      })

      // ✅ log purchase (string, safe Prisma)
      await tx.purchaseTx.create({
        data: {
          signature,
          payerWallet: payerWallet,
          kind: "REPAIR",
          chest: null,
          mint,
          amountRaw: expectedRaw.toString(),
          amountMac: costUi,
          amountUi: costUi,
          userId: user.id,
        },
      })

      return {
        ok: true as const,
        costUi,
        signature,
        item: {
          id: updatedItem.id,
          name: updatedItem.item.name,
          rarity: updatedItem.item.rarity,
          hp: updatedItem.hp,
          equipped: updatedItem.equipped,
          lastItemDecayAt: updatedItem.lastItemDecayAt,
          decayCarrySec: updatedItem.decayCarrySec,
        },
      }
    })

    if ((out as any).ok === false) {
      return NextResponse.json(
        { ok: false, error: (out as any).error, debug: (out as any).debug },
        { status: (out as any).status ?? 400 }
      )
    }

    return NextResponse.json(out)
  } catch (e: any) {
    console.error("REPAIR FINALIZE ERROR:", e)
    return NextResponse.json({ ok: false, error: e?.message ?? "Repair error" }, { status: 500 })
  }
}
