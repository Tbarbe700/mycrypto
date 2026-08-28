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

function pow10(decimals: number): bigint {
  let p = BigInt(1)
  const ten = BigInt(10)
  for (let i = 0; i < decimals; i++) p = p * ten
  return p
}

function uiToRawString(uiAmount: number, decimals: number): string {
  // ⚠️ conversion simple (ok si tes montants sont “propres”)
  const raw = Math.round(uiAmount * Math.pow(10, decimals))
  return BigInt(raw).toString()
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.redirect(new URL("/login", req.url))
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
    // 1) Freeze + calc claimable equipped
    const preview = await prisma.$transaction(async (tx) => {
      await settlePending(tx, playerId)

      const equipped = await tx.playerItem.findMany({
        where: { playerId, equipped: true },
        select: { pendingEarned: true },
      })

      const claimedUi = equipped.reduce((sum, it) => sum + safeNum(it.pendingEarned, 0), 0)

      return { claimedUi }
    })

    if (preview.claimedUi <= 0) {
      return NextResponse.redirect(new URL("/inventory", req.url))
    }

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

    // create user ATA if missing (treasury pays fee)
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

    // 3) Finalize DB (reset strict + pendingBalance - claimedUiNow) + log
    await prisma.$transaction(async (db) => {
      const already = await db.purchaseTx.findUnique({ where: { signature } })
      if (already) throw new Error("SIGNATURE_ALREADY_USED")

      // re-freeze to be consistent with lastClaimedAt (minimal delta)
      await settlePending(db, playerId)

      // 🔥 RESET STRICT: on remet à 0 tous les pendingEarned équipés
      await db.playerItem.updateMany({
        where: { playerId, equipped: true },
        data: { pendingEarned: 0 },
      })

      // 🔥 PendingBalance: on décrémente (au moins) le preview
      // garde-fou: on ne veut pas passer négatif
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
          kind: "CLAIM_EQUIPPED",
          chest: null,
          amountMac: preview.claimedUi,
          amountRaw: amountRawStr, // ✅ string
          amountUi: preview.claimedUi,
          mint,
          userId: user.id,
        } as any,
      })
    })

    // ✅ IMPORTANT: redirect => recharge /inventory => “en attente” disparaît
    return NextResponse.redirect(new URL("/inventory", req.url))
  } catch (e: any) {
    console.error("CLAIM EQUIPPED ERROR:", e)
    return NextResponse.redirect(new URL(`/inventory?err=${encodeURIComponent(e?.message ?? "CLAIM_FAILED")}`, req.url))
  }
}
