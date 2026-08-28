// app/inventory/RepairButton.tsx

"use client"

import { useState } from "react"
import { Connection, PublicKey, Transaction } from "@solana/web3.js"
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
} from "@solana/spl-token"

const RPC = process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com"

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

export default function RepairButton({
  playerItemId,
  disabled,
  label,
}: {
  playerItemId: string
  disabled?: boolean
  label: string
}) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const doRepair = async () => {
    setErr(null)
    setLoading(true)

    try {
      const provider = getProvider()
      if (!provider?.isPhantom) throw new Error("Phantom non détecté.")
      if (!provider.publicKey) await provider.connect()
      const payerPk = provider.publicKey
      if (!payerPk) throw new Error("Wallet non connecté.")

      // 1) prepare (serveur calcule coût + ATAs + dit si treasury ATA existe)
      const prepRes = await fetch("/api/items/repair/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerItemId }),
      })

      const prepText = await prepRes.text()
      const prep = prepText ? JSON.parse(prepText) : null
      if (!prepRes.ok || !prep?.ok) throw new Error(prep?.error || "Prepare repair failed")

      const connection = new Connection(RPC, "confirmed")

      const mintPk = new PublicKey(prep.mint)
      const treasuryOwner = new PublicKey(prep.treasury)
      const treasuryAta = new PublicKey(prep.treasuryAta)

      // Payer ATA : on le recalcule côté client (pas d'appel RPC)
      // Important: si le payer n'a pas d'ATA ou pas de tokens, la tx échouera (normal).
      // (Si tu veux le rendre plus UX-friendly, on peut ajouter un check côté serveur plus tard.)
      const payerAta = new PublicKey(prep.payerAta)

      const amountRaw = BigInt(prep.amountRaw)
      const decimals = Number(prep.decimals)

      const tx = new Transaction()

      // ✅ plus d'appel getAccountInfo dans le navigateur => plus de 403 ici
      if (!prep.treasuryAtaExists) {
        tx.add(createAssociatedTokenAccountInstruction(payerPk, treasuryAta, treasuryOwner, mintPk))
      }

      tx.add(
        createTransferCheckedInstruction(
          payerAta,
          mintPk,
          treasuryAta,
          payerPk,
          amountRaw,
          decimals
        )
      )

      tx.feePayer = payerPk
      const { blockhash } = await connection.getLatestBlockhash("confirmed")
      tx.recentBlockhash = blockhash

      // 2) Phantom pay
      const sent = await provider.signAndSendTransaction(tx)
      const signature = sent.signature

      await connection.confirmTransaction(signature, "confirmed")

      // 3) finalize
      const finRes = await fetch("/api/items/repair/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerItemId, signature }),
      })

      const finText = await finRes.text()
      const fin = finText ? JSON.parse(finText) : null
      if (!finRes.ok || !fin?.ok) throw new Error(fin?.error || "Finalize repair failed")

      window.location.reload()
    } catch (e: any) {
      const msg = e?.message || "Erreur repair"
      // petit bonus : si le RPC bloque le navigateur
      if (msg.includes("403")) {
        setErr("Erreur RPC (403). Vérifie NEXT_PUBLIC_SOLANA_RPC (utilise un RPC devnet public).")
      } else {
        setErr(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={doRepair}
        disabled={disabled || loading}
        className="w-full rounded-lg border px-3 py-2 text-sm font-medium text-emerald-700 bg-white hover:bg-emerald-50 border-emerald-200 disabled:opacity-60"
      >
        {loading ? "Réparation…" : label}
      </button>
      {err ? <div className="mt-1 text-xs text-rose-600">{err}</div> : null}
    </div>
  )
}
