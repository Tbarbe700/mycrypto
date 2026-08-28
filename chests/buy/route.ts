import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/src/lib/prisma"
import { ItemRarity } from "@prisma/client"
import { Connection, PublicKey } from "@solana/web3.js"

const MAX_INVENTORY = 40
type ChestKey = "C1" | "C2" | "C3"

/**
 * ✅ Ajout de LEGENDARY dans les rates
 * Ajuste librement les % si besoin.
 * (Les probabilités doivent sommer à 1.)
 */
const CHESTS: Record<
  ChestKey,
  { price: number; count: number; rates: Array<[ItemRarity, number]> }
> = {
  C1: {
    price: 50,
    count: 1,
    rates: [
      ["COMMON", 0.85],
      ["RARE", 0.14],
      ["EPIC", 0.01],
      ["LEGENDARY", 0.0],
    ],
  },
  C2: {
    price: 120,
    count: 3,
    rates: [
      ["COMMON", 0.7],
      ["RARE", 0.25],
      ["EPIC", 0.045],
      ["LEGENDARY", 0.005],
    ],
  },
  C3: {
    price: 250,
    count: 5,
    rates: [
      ["COMMON", 0.55],
      ["RARE", 0.35],
      ["EPIC", 0.095],
      ["LEGENDARY", 0.005],
    ],
  },
}

function pickRarity(rates: Array<[ItemRarity, number]>) {
  const r = Math.random()
  let acc = 0
  for (const [rarity, p] of rates) {
    acc += p
    if (r <= acc) return rarity
  }
  return rates[rates.length - 1][0]
}

function getEnv(name: string) {
  const v = process.env[name]
  if (!v) throw new Error(`ENV missing: ${name}`)
  return v
}

// ES2017-friendly (pas de 10n ni **)
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

    const rawStr = b?.uiTokenAmount?.amount // string raw integer
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

  // ✅ payer doit être signer
  const signers = (tx.transaction.message.accountKeys as any[])
    .filter((k) => !!k?.signer)
    .map((k) => (k?.pubkey?.toBase58?.() ?? k?.toBase58?.() ?? ""))

  if (!signers.includes(payerPk)) {
    return { ok: false as const, error: "PAYER_NOT_SIGNER", debug: { payer: payerPk, signers } }
  }

  // price = 50/120/250 => entiers => BigInt safe
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
        programs: (tx.transaction.message.instructions as any[])
          .map((ix) => ix?.program ?? ix?.programId?.toBase58?.() ?? "unknown")
          .slice(0, 20),
      },
    }
  }

  return { ok: true as const }
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)

  const chest = (body?.chest as ChestKey) || null
  const signature = String(body?.signature ?? "")
  const payer = String(body?.payer ?? "")

  if (!chest || !CHESTS[chest]) return NextResponse.json({ error: "Invalid chest" }, { status: 400 })
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 })
  if (!payer) return NextResponse.json({ error: "Missing payer" }, { status: 400 })

  const config = CHESTS[chest]

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { player: true },
  })
  if (!user?.player) return NextResponse.json({ error: "No player" }, { status: 400 })

  // ✅ Place inventaire (uniquement non-équipés)
  const inventoryCount = await prisma.playerItem.count({
    where: { playerId: user.player.id, equipped: false },
  })

  if (inventoryCount + config.count > MAX_INVENTORY) {
    return NextResponse.json(
      { error: "Inventaire plein", max: MAX_INVENTORY, inventory: inventoryCount, need: config.count },
      { status: 400 }
    )
  }

  // ✅ Verify payment SPL MAC
  const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com"
  const mint = getEnv("SOLANA_TOKEN_MINT")
  const treasury = getEnv("SOLANA_TREASURY_SOL")
  const decimals = Number(process.env.SOLANA_TOKEN_DECIMALS ?? 9)

  const ver = await verifyMacPayment({
    signature,
    payer,
    treasury,
    mint,
    expectedTokens: config.price,
    decimals,
    rpc,
  })

  if (!ver.ok) {
    console.error("verifyMacPayment failed:", ver)
    return NextResponse.json({ ok: false, error: ver.error, ...(ver as any) }, { status: 400 })
  }

  // ✅ Anti replay signature
  const already = await prisma.purchaseTx.findUnique({ where: { signature } })
  if (already) return NextResponse.json({ error: "SIGNATURE_ALREADY_USED" }, { status: 400 })

  // ✅ raw amount (BIGINT) mais stocké en STRING en DB
  const amountRawStr = (BigInt(config.price) * pow10(decimals)).toString()

  // ✅ Précharge items (RUNES uniquement: runeType != null)
  const allItems = await prisma.item.findMany({
    where: { runeType: { not: null } },
    select: { id: true, name: true, rarity: true, baseRate: true, maxHp: true, runeType: true },
  })

  if (!allItems.length) {
    return NextResponse.json(
      { error: "NO_RUNE_ITEMS_SEEDED", hint: "Seed des runes manquant (Item.runeType != null)" },
      { status: 500 }
    )
  }

  // ✅ Pools par rareté (inclut LEGENDARY)
  const byRarity: Record<ItemRarity, typeof allItems> = {
    COMMON: [],
    RARE: [],
    EPIC: [],
    LEGENDARY: [],
  } as any

  for (const it of allItems) {
    ;(byRarity[it.rarity] as any).push(it)
  }

  function pickItemForRarity(r: ItemRarity) {
    const pool = byRarity[r] ?? []
    if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)]

    // fallback: LEGENDARY -> EPIC -> RARE -> COMMON
    if (r === "LEGENDARY") {
      if (byRarity.EPIC.length) return byRarity.EPIC[Math.floor(Math.random() * byRarity.EPIC.length)]
      if (byRarity.RARE.length) return byRarity.RARE[Math.floor(Math.random() * byRarity.RARE.length)]
      if (byRarity.COMMON.length) return byRarity.COMMON[Math.floor(Math.random() * byRarity.COMMON.length)]
    }

    if (r === "EPIC") {
      if (byRarity.RARE.length) return byRarity.RARE[Math.floor(Math.random() * byRarity.RARE.length)]
      if (byRarity.COMMON.length) return byRarity.COMMON[Math.floor(Math.random() * byRarity.COMMON.length)]
    }

    if (r === "RARE") {
      if (byRarity.COMMON.length) return byRarity.COMMON[Math.floor(Math.random() * byRarity.COMMON.length)]
    }

    // dernier recours
    return allItems[Math.floor(Math.random() * allItems.length)]
  }

  // ✅ Transaction DB (log + drops)
  const created = await prisma.$transaction(async (tx) => {
    const invNow = await tx.playerItem.count({
      where: { playerId: user.player!.id, equipped: false },
    })
    if (invNow + config.count > MAX_INVENTORY) throw new Error("Inventaire plein")

    await tx.purchaseTx.create({
      data: {
        signature,
        payerWallet: payer,
        kind: "CHEST_BUY",
        chest,
        amountMac: config.price,
        mint,
        amountRaw: amountRawStr,
        amountUi: config.price,
        userId: user.id,
      } as any,
    })

    const drops: Array<{
      itemId: string
      rarity: ItemRarity
      name: string
      baseRate: number
      runeType: string | null
    }> = []

    for (let i = 0; i < config.count; i++) {
      const rarity = pickRarity(config.rates)
      const picked = pickItemForRarity(rarity)

      const pi = await tx.playerItem.create({
        data: {
          playerId: user.player!.id,
          itemId: picked.id,
          equipped: false,
          hp: picked.maxHp ?? 100,
        },
        include: { item: true },
      })

      drops.push({
        itemId: pi.itemId,
        rarity: pi.item.rarity,
        name: pi.item.name,
        baseRate: pi.item.baseRate,
        runeType: (pi.item as any).runeType ?? null,
      })
    }

    return { drops }
  })

  return NextResponse.json({
    ok: true,
    chest,
    price: config.price,
    count: config.count,
    drops: created.drops,
  })
}
