"use client"

import { useState } from "react"
import { Connection, PublicKey, Transaction } from "@solana/web3.js"
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
} from "@solana/spl-token"

const RPC = process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com"
const MINT = process.env.NEXT_PUBLIC_TOKEN_MINT || ""
const DECIMALS = Number(process.env.NEXT_PUBLIC_TOKEN_DECIMALS ?? 9)

type PhantomProvider = {
  isPhantom?: boolean
  publicKey?: PublicKey
  connect: () => Promise<any>
  signAndSendTransaction: (tx: Transaction) => Promise<{ signature: string }>
}

function getProvider(): PhantomProvider | null {
  if (typeof window === "undefined") return null
  return (((window as any).phantom?.solana ?? (window as any).solana) as PhantomProvider) ?? null
}

export default function PlayerUpgradeButton({ disabled }: { disabled?: boolean }) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const doUpgrade = async () => {
    setErr(null)
    setLoading(true)
    try {
      const provider = getProvider()
      if (!provider?.isPhantom) throw new Error("Phantom non détecté.")
      if (!provider.publicKey) await provider.connect()
      const payerPk = provider.publicKey
      if (!payerPk) throw new Error("Wallet non connecté.")

      // 1) prepare
      const prepRes = await fetch("/api/player/upgrade/prepare", { method: "POST" })
      const prepText = await prepRes.text()
      const prep = prepText ? JSON.parse(prepText) : null
      if (!prepRes.ok || !prep?.ok) throw new Error(prep?.error || "Prepare upgrade failed")

      if (!MINT) throw new Error("NEXT_PUBLIC_TOKEN_MINT manquant")
      const mintPk = new PublicKey(MINT)
      const treasuryOwner = new PublicKey(prep.treasury)

      const connection = new Connection(RPC, "confirmed")
      const payerAta = await getAssociatedTokenAddress(mintPk, payerPk)
      const treasuryAta = await getAssociatedTokenAddress(mintPk, treasuryOwner)

      const tx = new Transaction()

      const treasuryInfo = await connection.getAccountInfo(treasuryAta)
      if (!treasuryInfo) {
        tx.add(createAssociatedTokenAccountInstruction(payerPk, treasuryAta, treasuryOwner, mintPk))
      }

      const amountRaw = BigInt(prep.amountRaw)

      tx.add(
        createTransferCheckedInstruction(
          payerAta,
          mintPk,
          treasuryAta,
          payerPk,
          amountRaw,
          DECIMALS
        )
      )

      tx.feePayer = payerPk
      const { blockhash } = await connection.getLatestBlockhash("confirmed")
      tx.recentBlockhash = blockhash

      // 2) phantom pay
      const sent = await provider.signAndSendTransaction(tx)
      const signature = sent.signature
      await connection.confirmTransaction(signature, "confirmed")

      // 3) finalize
      const finRes = await fetch("/api/player/upgrade/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature }),
      })
      const finText = await finRes.text()
      const fin = finText ? JSON.parse(finText) : null
      if (!finRes.ok || !fin?.ok) throw new Error(fin?.error || "Finalize upgrade failed")

      window.location.reload()
    } catch (e: any) {
      setErr(e?.message || "Erreur upgrade")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={doUpgrade}
        disabled={disabled || loading}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {loading ? "Upgrade…" : "Upgrade (MAC)"}
      </button>

      {err ? <div className="mt-1 text-xs text-rose-600">{err}</div> : null}
    </div>
  )
}
