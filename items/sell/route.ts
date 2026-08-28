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

  const form = await req.formData().catch(() => null)
  const playerItemId = String(form?.get("playerItemId") ?? "")
  if (!playerItemId) return NextResponse.redirect(new URL("/inventory?err=MISSING_ITEM_ID", req.url))

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { player: true },
  })
  if (!user?.player) return NextResponse.redirect(new URL("/api/me", req.url))

  const playerId = user.player.id
  const wallet = user.player.solanaWallet
  if (!wallet) return NextResponse.redirect(new URL("/inventory?err=WALLET_NOT_LINKED", req.url))

  try {
    // 1) Preview (freeze pending + compute payout)
    const preview = await prisma.$transaction(async (tx) => {
      await settlePending(tx, playerId)

      const pi = await tx.playerItem.findUnique({
        where: { id: playerItemId },
        select: {
          id: true,
          playerId: true,
          equipped: true,
          pendingEarned: true,
          item: { select: { rarity: true } },
        },
      })

      if (!pi || pi.playerId !== playerId) throw new Error("ITEM_NOT_FOUND")
      if (pi.equipped) throw new Error("CANNOT_SELL_EQUIPPED") // garde-fou

      const pending = safeNum(pi.pendingEarned, 0)
      const sell = sellPriceForRarity(pi.item.rarity)
      const payoutUi = pending + sell

      return {
        pendingUi: pending,
        sellUi: sell,
        payoutUi,
        rarity: pi.item.rarity,
      }
    })

    if (preview.payoutUi <= 0) return NextResponse.redirect(new URL("/inventory", req.url))

    // 2) On-chain transfer treasury -> user
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

    // 3) Finalize DB: re-freeze, remove item, decrement pendingBalance, log
    await prisma.$transaction(async (db) => {
      const already = await db.purchaseTx.findUnique({ where: { signature } })
      if (already) throw new Error("SIGNATURE_ALREADY_USED")

      await settlePending(db, playerId)

      // reread pending on item (it might have slightly changed)
      const piNow = await db.playerItem.findUnique({
        where: { id: playerItemId },
        select: { id: true, playerId: true, equipped: true, pendingEarned: true, item: { select: { rarity: true } } },
      })
      if (!piNow || piNow.playerId !== playerId) throw new Error("ITEM_NOT_FOUND")
      if (piNow.equipped) throw new Error("CANNOT_SELL_EQUIPPED")

      const pendingNow = safeNum(piNow.pendingEarned, 0)

      // delete the item (pending goes away with it)
      await db.playerItem.delete({ where: { id: playerItemId } })

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
          kind: "SELL_ONE_INVENTORY",
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
    console.error("SELL ONE INVENTORY ERROR:", e)
    return NextResponse.redirect(new URL(`/inventory?err=${encodeURIComponent(e?.message ?? "SELL_FAILED")}`, req.url))
  }
}
