import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/src/lib/prisma"
import { settlePending } from "@/src/lib/settlePending"

import { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction } from "@solana/web3.js"
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
} from "@solana/spl-token"

function safeNum(x: any, fallback = 0) {
  const n = typeof x === "number" ? x : Number(x)
  return Number.isFinite(n) ? n : fallback
}

function getEnv(name: string) {
  const v = process.env[name]
  if (!v) throw new Error(`ENV missing: ${name}`)
  return v
}

function loadTreasuryKeypair(): Keypair {
  const raw = getEnv("SOLANA_TREASURY_TOKEN_SECRET")
  let arr: number[]
  try {
    arr = JSON.parse(raw)
  } catch {
    throw new Error("SOLANA_TREASURY_TOKEN_SECRET must be a JSON array (ex: [1,2,3,...])")
  }
  return Keypair.fromSecretKey(Uint8Array.from(arr))
}

function uiToRawString(uiAmount: number, decimals: number): string {
  const raw = Math.round(uiAmount * Math.pow(10, decimals))
  return BigInt(raw).toString()
}

function sellPriceForRarity(r: string) {
  switch (r) {
    case "COMMON":
      return 10
    case "RARE":
      return 30
    case "EPIC":
      return 80
    default:
      return 5
  }
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.redirect(new URL("/login", req.url))

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { player: true },
  })
  if (!user?.player) return NextResponse.redirect(new URL("/api/me", req.url))

  const playerId = user.player.id
  const wallet = user.player.solanaWallet
  if (!wallet) return NextResponse.redirect(new URL("/inventory?err=WALLET_NOT_LINKED", req.url))

  try {
    // 1) Preview
    const preview = await prisma.$transaction(async (tx) => {
      await settlePending(tx, playerId)

      const items = await tx.playerItem.findMany({
        where: { playerId, equipped: false },
        select: { id: true, pendingEarned: true, item: { select: { rarity: true } } },
      })

      if (items.length === 0) return { payoutUi: 0, ids: [] as string[], pendingSum: 0 }

      const pendingSum = items.reduce((s, it) => s + safeNum(it.pendingEarned, 0), 0)
      const sellSum = items.reduce((s, it) => s + sellPriceForRarity(it.item.rarity), 0)
      const payoutUi = pendingSum + sellSum

      return { payoutUi, ids: items.map((x) => x.id), pendingSum }
    })

    if (preview.payoutUi <= 0 || preview.ids.length === 0) {
      return NextResponse.redirect(new URL("/inventory", req.url))
    }

    // 2) On-chain transfer
    const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC || process.env.SOLANA_RPC || "https://api.devnet.solana.com"
    const decimals = Number(process.env.SOLANA_TOKEN_DECIMALS ?? 9)
    const mint = getEnv("SOLANA_TOKEN_MINT")

    const mintPk = new PublicKey(mint)
    const userPk = new PublicKey(wallet)
    const treasuryKp = loadTreasuryKeypair()
    const treasuryPk = treasuryKp.publicKey

    const connection = new Connection(rpc, "confirmed")

    const treasuryAta = await getAssociatedTokenAddress(mintPk, treasuryPk)
    const userAta = await getAssociatedTokenAddress(mintPk, userPk)

    const tx = new Transaction()

    const userAtaInfo = await connection.getAccountInfo(userAta)
    if (!userAtaInfo) {
      tx.add(createAssociatedTokenAccountInstruction(treasuryPk, userAta, userPk, mintPk))
    }

    const amountRawStr = uiToRawString(preview.payoutUi, decimals)

    tx.add(
      createTransferCheckedInstruction(
        treasuryAta,
        mintPk,
        userAta,
        treasuryPk,
        BigInt(amountRawStr),
        decimals
      )
    )

    tx.feePayer = treasuryPk
    const { blockhash } = await connection.getLatestBlockhash("confirmed")
    tx.recentBlockhash = blockhash

    const signature = await sendAndConfirmTransaction(connection, tx, [treasuryKp], {
      commitment: "confirmed",
    })

    // 3) Finalize DB: re-freeze, recompute pending on these ids, delete, decrement pendingBalance, log
    await prisma.$transaction(async (db) => {
      const already = await db.purchaseTx.findUnique({ where: { signature } })
      if (already) throw new Error("SIGNATURE_ALREADY_USED")

      await settlePending(db, playerId)

      const itemsNow = await db.playerItem.findMany({
        where: { id: { in: preview.ids }, playerId, equipped: false },
        select: { id: true, pendingEarned: true, item: { select: { rarity: true } } },
      })

      const pendingNow = itemsNow.reduce((s, it) => s + safeNum(it.pendingEarned, 0), 0)

      // delete all
      if (itemsNow.length > 0) {
        await db.playerItem.deleteMany({ where: { id: { in: itemsNow.map((x) => x.id) } } })
      }

      // pendingBalance decrement (safe clamp)
      const p = await db.player.findUnique({ where: { id: playerId }, select: { pendingBalance: true } })
      const pb = safeNum(p?.pendingBalance, 0)
      const dec = Math.min(pb, pendingNow)

      if (dec > 0) {
        await db.player.update({
          where: { id: playerId },
          data: { pendingBalance: { decrement: dec } },
        })
      }

      await db.purchaseTx.create({
        data: {
          signature,
          payerWallet: wallet,
          kind: "SELL_ALL_INVENTORY",
          chest: null,
          amountMac: preview.payoutUi,
          amountRaw: amountRawStr,
          amountUi: preview.payoutUi,
          mint,
          userId: user.id,
        } as any,
      })
    })

    return NextResponse.redirect(new URL("/inventory", req.url))
  } catch (e: any) {
    console.error("SELL ALL INVENTORY ERROR:", e)
    return NextResponse.redirect(new URL(`/inventory?err=${encodeURIComponent(e?.message ?? "SELL_FAILED")}`, req.url))
  }
}
