import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/src/lib/prisma"
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js"
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
} from "@solana/spl-token"

// 🔧 Connection devnet (comme toi)
const connection = new Connection("https://api.devnet.solana.com", "confirmed")

function jsonSecretToKeypair(secret: string) {
  const arr = JSON.parse(secret)
  const secretKey = Uint8Array.from(arr)
  return Keypair.fromSecretKey(secretKey)
}

export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 })
    }

    const { signature, walletAddress, solAmount } = await req.json()

    if (!signature || !walletAddress || !solAmount) {
      return NextResponse.json({ ok: false, error: "MISSING_FIELDS" }, { status: 400 })
    }

    const SOLANA_TREASURY_SOL = process.env.SOLANA_TREASURY_SOL
    const SOLANA_TOKEN_MINT = process.env.SOLANA_TOKEN_MINT
    const SOLANA_TREASURY_TOKEN_SECRET = process.env.SOLANA_TREASURY_TOKEN_SECRET
    const SWAP_RATE = Number(process.env.SWAP_RATE_TOKENS_PER_SOL || "0")

    if (!SOLANA_TREASURY_SOL || !SOLANA_TOKEN_MINT || !SOLANA_TREASURY_TOKEN_SECRET || !SWAP_RATE) {
      return NextResponse.json({ ok: false, error: "ENV_MISSING" }, { status: 500 })
    }

    const payerWallet = new PublicKey(walletAddress)
    const treasurySol = new PublicKey(SOLANA_TREASURY_SOL)
    const mint = new PublicKey(SOLANA_TOKEN_MINT)

    // ✅ Montant attendu en lamports
    const lamportsExpected = Math.round(Number(solAmount) * 1_000_000_000)
    if (!Number.isFinite(lamportsExpected) || lamportsExpected <= 0) {
      return NextResponse.json({ ok: false, error: "BAD_AMOUNT" }, { status: 400 })
    }

    // ✅ Vérif DB user/player
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { player: true },
    })
    if (!user?.player) {
      return NextResponse.json({ ok: false, error: "PLAYER_NOT_FOUND" }, { status: 404 })
    }

    // ✅ Vérifier la transaction SOL on-chain
    const tx = await connection.getTransaction(signature, { commitment: "confirmed" })
    if (!tx) {
      return NextResponse.json({ ok: false, error: "TX_NOT_FOUND" }, { status: 400 })
    }

    // Option simple: vérifier les balances (delta)
    // Le wallet du joueur doit avoir perdu au moins lamportsExpected (plus fees),
    // et la treasury doit avoir gagné exactement lamportsExpected.
    const pre = tx.meta?.preBalances
    const post = tx.meta?.postBalances
    const keys = tx.transaction.message.getAccountKeys().staticAccountKeys

    if (!pre || !post || !keys) {
      return NextResponse.json({ ok: false, error: "TX_META_MISSING" }, { status: 400 })
    }

    const payerIndex = keys.findIndex((k) => k.equals(payerWallet))
    const treasuryIndex = keys.findIndex((k) => k.equals(treasurySol))

    if (payerIndex < 0 || treasuryIndex < 0) {
      return NextResponse.json({ ok: false, error: "ACCOUNTS_NOT_FOUND_IN_TX" }, { status: 400 })
    }

    const treasuryDelta = post[treasuryIndex] - pre[treasuryIndex]
    if (treasuryDelta !== lamportsExpected) {
      return NextResponse.json(
        { ok: false, error: "BAD_TREASURY_DELTA", expected: lamportsExpected, got: treasuryDelta },
        { status: 400 }
      )
    }

    // ✅ Calcul tokens à envoyer
    const tokensToSend = Number(solAmount) * SWAP_RATE
    if (!Number.isFinite(tokensToSend) || tokensToSend <= 0) {
      return NextResponse.json({ ok: false, error: "BAD_RATE_CALC" }, { status: 500 })
    }

    // Tu as 9 décimales sur ton mint (d’après ton output)
    const decimals = 9
    const amountInSmallestUnits = BigInt(Math.round(tokensToSend * 10 ** decimals))

    // ✅ Envoi SPL Token depuis la treasury token owner vers le joueur
    const treasuryTokenOwner = jsonSecretToKeypair(SOLANA_TREASURY_TOKEN_SECRET)

    const fromAta = await getAssociatedTokenAddress(mint, treasuryTokenOwner.publicKey)
    const toAta = await getAssociatedTokenAddress(mint, payerWallet)

    const instructions = []

    // Crée l’ATA du receveur si absent
    const toInfo = await connection.getAccountInfo(toAta)
    if (!toInfo) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          treasuryTokenOwner.publicKey, // payer
          toAta,
          payerWallet,
          mint
        )
      )
    }

    instructions.push(
      createTransferCheckedInstruction(
        fromAta,
        mint,
        toAta,
        treasuryTokenOwner.publicKey,
        amountInSmallestUnits,
        decimals
      )
    )

    const tokenTx = new Transaction().add(...instructions)

    const tokenSig = await sendAndConfirmTransaction(connection, tokenTx, [treasuryTokenOwner], {
      commitment: "confirmed",
    })

    // (Optionnel) log en DB si tu veux historiser les swaps
    // sinon on renvoie juste ok
    return NextResponse.json({
      ok: true,
      solPaid: Number(solAmount),
      tokensSent: tokensToSend,
      tokenSignature: tokenSig,
    })
  } catch (e: any) {
    console.error("swap error:", e)
    return NextResponse.json(
      { ok: false, error: "SERVER_ERROR", details: e?.message ?? String(e) },
      { status: 500 }
    )
  }
}
