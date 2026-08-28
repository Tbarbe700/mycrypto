import { NextResponse } from "next/server"
import { Connection, PublicKey } from "@solana/web3.js"
import { getAssociatedTokenAddress } from "@solana/spl-token"

const RPC = process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com"
const TOKEN_MINT = process.env.SOLANA_TOKEN_MINT || process.env.NEXT_PUBLIC_TOKEN_MINT || ""
const TREASURY_SOL = process.env.SOLANA_TREASURY_SOL || process.env.NEXT_PUBLIC_TREASURY_SOL || ""

const DECIMALS = 9

export async function POST(req: Request) {
  try {
    const { signature, payer, amountMac } = await req.json()

    if (!signature || !payer || !amountMac) {
      return NextResponse.json({ ok: false, error: "MISSING_FIELDS" }, { status: 400 })
    }
    if (!TOKEN_MINT || !TREASURY_SOL) {
      return NextResponse.json({ ok: false, error: "ENV_MISSING" }, { status: 500 })
    }

    const connection = new Connection(RPC, "confirmed")

    const mint = new PublicKey(TOKEN_MINT)
    const treasuryOwner = new PublicKey(TREASURY_SOL)

    // Destination attendue = ATA du treasury pour ce mint
    const expectedTreasuryAta = await getAssociatedTokenAddress(mint, treasuryOwner)

    const tx = await connection.getParsedTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    })

    if (!tx) return NextResponse.json({ ok: false, error: "TX_NOT_FOUND" }, { status: 400 })

    const expected = Math.round(Number(amountMac) * 10 ** DECIMALS)

    const ok = tx.transaction.message.instructions.some((ix: any) => {
      if (ix?.program !== "spl-token") return false
      if (ix?.parsed?.type !== "transferChecked") return false

      const info = ix.parsed.info
      const dest = String(info?.destination ?? "")
      const authority = String(info?.authority ?? "")
      const mintIx = String(info?.mint ?? "")
      const amount = Number(info?.tokenAmount?.amount ?? 0)

      return (
        dest === expectedTreasuryAta.toBase58() &&
        authority === String(payer) &&
        mintIx === mint.toBase58() &&
        amount === expected
      )
    })

    if (!ok) {
      return NextResponse.json(
        { ok: false, error: "TRANSFER_NOT_FOUND", expectedAmount: expected, expectedDestination: expectedTreasuryAta.toBase58() },
        { status: 400 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "VERIFY_FAILED" }, { status: 500 })
  }
}
