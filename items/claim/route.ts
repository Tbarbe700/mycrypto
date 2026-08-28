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

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  const form = await req.formData().catch(() => null)
  const playerItemId = String(form?.get("playerItemId") ?? "")
  if (!playerItemId) {
    return NextResponse.redirect(new URL("/inventory?err=MISSING_ITEM_ID", req.url))
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { player: true },
  })
  if (!user?.player) {
    return NextResponse.redirect(new URL("/api/me", req.url))
  }

  const playerId = user.player.id
  const wallet = user.player.solanaWallet
  if (!wallet) {
    return NextResponse.redirect(new URL("/inventory?err=WALLET_NOT_LINKED", req.url))
  }

  try {
    // 1) Freeze + récupérer le pending de CET item
    const preview = await prisma.$transaction(async (tx) => {
      await settlePending(tx, playerId)

      const it = await tx.playerItem.findUnique({
        where: { id: playerItemId },
        select: { id: true, playerId: true, equipped: true, pendingEarned: true },
      })

      if (!it || it.playerId !== playerId) {
        throw new Error("ITEM_NOT_FOUND")
      }

      const claimedUi = safeNum(it.pendingEarned, 0)
      return { claimedUi, equipped: it.equipped }
    })

    if (preview.claimedUi <= 0) {
      return NextResponse.redirect(new URL("/inventory", req.url))
    }

    // 2) Transfer on-chain treasury -> user
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

    const amountRawStr = uiToRawString(preview.claimedUi, decimals)

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

    // 3) Finalize DB : reset pendingEarned de CET item + pendingBalance decrement + log
    await prisma.$transaction(async (db) => {
      const already = await db.purchaseTx.findUnique({ where: { signature } })
      if (already) throw new Error("SIGNATURE_ALREADY_USED")

      await settlePending(db, playerId)

      // reset strict sur l’item
      await db.playerItem.update({
        where: { id: playerItemId },
        data: { pendingEarned: 0 },
      })

      // pendingBalance safe decrement
      const p = await db.player.findUnique({
        where: { id: playerId },
        select: { pendingBalance: true },
      })
      const pb = safeNum(p?.pendingBalance, 0)
      const dec = Math.min(pb, preview.claimedUi)

      await db.player.update({
        where: { id: playerId },
        data: { pendingBalance: { decrement: dec } },
      })

      await db.purchaseTx.create({
        data: {
          signature,
          payerWallet: wallet,
          kind: preview.equipped ? "CLAIM_ONE_EQUIPPED" : "CLAIM_ONE_INVENTORY",
          chest: null,
          amountMac: preview.claimedUi,
          amountRaw: amountRawStr,
          amountUi: preview.claimedUi,
          mint,
          userId: user.id,
        } as any,
      })
    })

    return NextResponse.redirect(new URL("/inventory", req.url))
  } catch (e: any) {
    console.error("CLAIM ONE ITEM ERROR:", e)
    return NextResponse.redirect(new URL(`/inventory?err=${encodeURIComponent(e?.message ?? "CLAIM_FAILED")}`, req.url))
  }
}
