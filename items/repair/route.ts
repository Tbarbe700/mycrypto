import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/src/lib/prisma"
import { settlePending } from "@/src/lib/settlePending"
import { Connection, PublicKey } from "@solana/web3.js"

const DECAY_INTERVAL_SEC = 60 // ⚠️ même valeur que decay/equip/unequip

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

class HttpError extends Error {
  status: number
  data?: any
  constructor(status: number, message: string, data?: any) {
    super(message)
    this.status = status
    this.data = data
  }
}

function safeNum(x: any, fallback = 0) {
  const n = typeof x === "number" ? x : Number(x)
  return Number.isFinite(n) ? n : fallback
}

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

    const rawStr = b?.uiTokenAmount?.amount // raw integer string
    if (!rawStr) continue

    try {
      sum += BigInt(rawStr)
    } catch {
      // ignore
    }
  }
  return sum
}

async function verifyMacPayment(opts: {
  signature: string
  payer: string
  treasury: string
  mint: string
  expectedTokens: number
  decimals: number
  rpc: string
}) {
  const { signature, payer, treasury, mint, expectedTokens, decimals, rpc } = opts
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

  // expected raw
  const expectedRaw = BigInt(expectedTokens) * pow10(decimals)

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

  return { ok: true as const, expectedRaw }
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const form = await req.formData()
  const playerItemId = String(form.get("playerItemId") || "")
  const signature = String(form.get("signature") || "")
  const payer = String(form.get("payer") || "")

  if (!playerItemId) return NextResponse.json({ error: "Missing playerItemId" }, { status: 400 })
  if (!signature || !payer) {
    // ⛔ maintenant obligatoire : on paye via Phantom
    return NextResponse.json({ error: "PAYMENT_REQUIRED" }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { player: true },
  })
  if (!user?.player) return NextResponse.json({ error: "No player" }, { status: 400 })

  const playerId = user.player.id
  const now = new Date()

  try {
    // ✅ 0) anti-replay signature
    const already = await prisma.purchaseTx.findUnique({ where: { signature } })
    if (already) return NextResponse.json({ error: "SIGNATURE_ALREADY_USED" }, { status: 400 })

    const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC || process.env.SOLANA_RPC || "https://api.devnet.solana.com"
    const mint = getEnv("SOLANA_TOKEN_MINT")
    const treasury = getEnv("SOLANA_TREASURY_SOL")
    const decimals = Number(process.env.SOLANA_TOKEN_DECIMALS ?? 9)

    // ✅ 1) settle pending + lire l'item + calcul cost
    const preview = await prisma.$transaction(async (tx) => {
      await settlePending(tx, playerId)

      const pi = await tx.playerItem.findFirst({
        where: { id: playerItemId, playerId },
        include: { item: true },
      })
      if (!pi) throw new HttpError(404, "Item not found")

      const hp = Math.max(0, Math.min(100, Number(pi.hp) || 0))
      if (hp >= 100) throw new HttpError(400, "Item déjà à 100%")

      const missing = 100 - hp
      const mult = rarityMult(pi.item.rarity)
      const cost = Math.ceil(missing * mult)

      return {
        cost,
        equipped: pi.equipped,
        itemRarity: pi.item.rarity,
        hp,
      }
    })

    // ✅ 2) verifier paiement on-chain (payer -> treasury) pour EXACTEMENT cost MAC
    const ver = await verifyMacPayment({
      signature,
      payer,
      treasury,
      mint,
      expectedTokens: preview.cost,
      decimals,
      rpc,
    })

    if (!ver.ok) {
      console.error("REPAIR payment verify failed:", ver)
      return NextResponse.json({ ok: false, error: ver.error, ...(ver as any) }, { status: 400 })
    }

    // ✅ 3) appliquer la réparation + log (amountRaw STRING)
    const out = await prisma.$transaction(async (tx) => {
      // garde-fou : re-freeze
      await settlePending(tx, playerId)

      const pi = await tx.playerItem.findFirst({
        where: { id: playerItemId, playerId },
        include: { item: true },
      })
      if (!pi) throw new HttpError(404, "Item not found")

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

      // log purchase
      await tx.purchaseTx.create({
        data: {
          signature,
          payerWallet: payer,
          kind: "REPAIR",
          chest: null,
          mint,
          amountRaw: ver.expectedRaw.toString(), // ✅ STRING (sinon ton erreur)
          amountMac: preview.cost,
          amountUi: preview.cost,
          userId: user.id,
        },
      })

      return {
        ok: true,
        cost: preview.cost,
        signature,
        wallet: payer,
        item: {
          id: updatedItem.id,
          name: updatedItem.item.name,
          rarity: updatedItem.item.rarity,
          hp: updatedItem.hp,
          lastItemDecayAt: updatedItem.lastItemDecayAt,
          decayCarrySec: updatedItem.decayCarrySec,
          equipped: updatedItem.equipped,
        },
      }
    })

    return NextResponse.json(out)
  } catch (e: any) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message, ...(e.data ?? {}) }, { status: e.status })
    }
    console.error("REPAIR ERROR:", e)
    return NextResponse.json({ error: e?.message ?? "Repair error" }, { status: 500 })
  }
}
