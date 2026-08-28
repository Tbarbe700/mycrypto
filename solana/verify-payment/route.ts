import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/src/lib/prisma"
import { PublicKey } from "@solana/web3.js"
import { solanaConnection } from "@/src/lib/solana/connection"
import {
  CHARACTER_PRICE_LAMPORTS,
  RECEIVER_WALLET,
} from "@/src/lib/solana/constants"

type Body = {
  signature: string
  walletAddress: string
}

export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 })
    }

    const { signature, walletAddress } = (await req.json()) as Body
    if (!signature || !walletAddress) {
      return NextResponse.json({ ok: false, error: "MISSING_FIELDS" }, { status: 400 })
    }

    if (!RECEIVER_WALLET) {
      return NextResponse.json({ ok: false, error: "RECEIVER_WALLET_NOT_SET" }, { status: 500 })
    }

    // 1) récupérer user + player
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { player: true },
    })
    if (!user?.player) {
      return NextResponse.json({ ok: false, error: "PLAYER_NOT_FOUND" }, { status: 404 })
    }

    // Déjà débloqué ? on renvoie OK (idempotent)
    if (user.player.characterUnlocked) {
      return NextResponse.json({ ok: true, alreadyUnlocked: true })
    }

    // 2) vérifier la transaction SOL sur Devnet
    const tx = await solanaConnection.getParsedTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    })

    if (!tx) {
      return NextResponse.json({ ok: false, error: "TX_NOT_FOUND" }, { status: 404 })
    }

    const receiver = new PublicKey(RECEIVER_WALLET).toBase58()

    const ixs = tx.transaction.message.instructions as any[]
    const transfers = ixs
      .filter((ix) => ix?.parsed?.type === "transfer")
      .map((ix) => ({
        source: ix.parsed.info?.source as string | undefined,
        destination: ix.parsed.info?.destination as string | undefined,
        lamports: Number(ix.parsed.info?.lamports ?? 0),
      }))

    const match = transfers.find(
      (t) =>
        t.source === walletAddress &&
        t.destination === receiver &&
        t.lamports >= CHARACTER_PRICE_LAMPORTS
    )

    if (!match) {
      return NextResponse.json(
        {
          ok: false,
          error: "PAYMENT_NOT_FOUND",
          details: {
            expectedSource: walletAddress,
            expectedDestination: receiver,
            minLamports: CHARACTER_PRICE_LAMPORTS,
            transfers,
          },
        },
        { status: 400 }
      )
    }

    // 3) Update DB -> débloqué
    await prisma.player.update({
      where: { userId: user.id }, // ✅ user.id == User.id, et Player.userId référence User.id
      data: {
        characterUnlocked: true,
        solanaWallet: walletAddress,
        unlockSignature: signature,
        unlockedAt: new Date(),
      },
    })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "SERVER_ERROR", details: e?.message ?? String(e) },
      { status: 500 }
    )
  }
}
