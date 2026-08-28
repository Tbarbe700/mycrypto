"use client"

import { useEffect, useRef, useState } from "react"
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js"
import { solanaConnection } from "@/src/lib/solana/connection"

type PhantomProvider = {
  isPhantom?: boolean
  publicKey?: { toBase58: () => string }
  connect: () => Promise<any>
  disconnect?: () => Promise<void>
  signAndSendTransaction: (tx: Transaction) => Promise<{ signature: string }>
}

const TREASURY_SOL = process.env.NEXT_PUBLIC_TREASURY_SOL || ""
const RATE = Number(process.env.NEXT_PUBLIC_SWAP_RATE_TOKENS_PER_SOL || "0")

function getProvider(): PhantomProvider | null {
  if (typeof window === "undefined") return null
  return (((window as any).phantom?.solana ?? (window as any).solana) as PhantomProvider) ?? null
}

export default function SwapCard() {
  const [wallet, setWallet] = useState<string>("")
  const [sol, setSol] = useState<string>("0.1")
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const providerRef = useRef<PhantomProvider | null>(null)

  useEffect(() => {
    const p = getProvider()
    if (p?.isPhantom) {
      providerRef.current = p
      if (p.publicKey) setWallet(p.publicKey.toBase58())
    }
  }, [])

  const connect = async () => {
    setErr(null)
    setMsg(null)

    const p = getProvider()
    if (!p?.isPhantom) return setErr("Phantom non détecté.")

    providerRef.current = p

    try {
      await p.disconnect?.()
    } catch {}

    const resp = await p.connect()

    const pk = resp?.publicKey?.toBase58?.() ?? p.publicKey?.toBase58?.()
    if (!pk) return setErr("Connexion OK mais publicKey introuvable.")
    setWallet(pk)
  }

  const doSwap = async () => {
    setErr(null)
    setMsg(null)

    if (!wallet) return setErr("Connecte Phantom d’abord.")
    if (!TREASURY_SOL) return setErr("NEXT_PUBLIC_TREASURY_SOL manquant.")
    if (!RATE) return setErr("NEXT_PUBLIC_SWAP_RATE_TOKENS_PER_SOL manquant.")

    const p = providerRef.current
    if (!p) return setErr("Provider Phantom manquant (reconnecte).")

    const solAmount = Number(sol)
    if (!Number.isFinite(solAmount) || solAmount <= 0) return setErr("Montant SOL invalide.")

    try {
      setLoading(true)

      const fromPubkey = new PublicKey(wallet)
      const toPubkey = new PublicKey(TREASURY_SOL)
      const lamports = Math.round(solAmount * 1_000_000_000)

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey,
          toPubkey,
          lamports,
        })
      )

      tx.feePayer = fromPubkey
      const { blockhash } = await solanaConnection.getLatestBlockhash("confirmed")
      tx.recentBlockhash = blockhash

      const { signature } = await p.signAndSendTransaction(tx)
      await solanaConnection.confirmTransaction(signature, "confirmed")

      const r = await fetch("/api/solana/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature, walletAddress: wallet, solAmount }),
      })

      const contentType = r.headers.get("content-type") || ""
      const raw = await r.text()
      const data = contentType.includes("application/json") ? JSON.parse(raw) : null

      if (!r.ok || !data?.ok) {
        console.error("swap api:", r.status, contentType, raw)
        setErr(data?.error ?? "Swap échoué (API).")
        return
      }

      setMsg(`✅ Swap OK : ${data.tokensSent} tokens envoyés. Tx token: ${data.tokenSignature}`)
    } catch (e: any) {
      setErr(e?.message ?? "Swap annulé/échoué.")
    } finally {
      setLoading(false)
    }
  }

  const estimate = (() => {
    const solAmount = Number(sol)
    if (!Number.isFinite(solAmount) || solAmount <= 0) return 0
    return solAmount * RATE
  })()

  return (
    <div className="h-full w-full p-4 text-white">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Swap interne</h2>
        <div className="text-xs text-white/70">1 SOL = {RATE} tokens</div>
      </div>

      {!wallet ? (
        <button
          onClick={connect}
          className="mt-3 w-full rounded-lg bg-white/90 px-3 py-2 text-sm font-semibold text-black hover:bg-white"
        >
          Connecter Phantom
        </button>
      ) : (
        <div className="mt-3 text-xs text-white/80">
          Wallet: <b>{wallet.slice(0, 4)}...{wallet.slice(-4)}</b>
        </div>
      )}

      <div className="mt-3">
        <label className="text-xs text-white/70">Montant SOL</label>
        <input
          value={sol}
          onChange={(e) => setSol(e.target.value)}
          className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none"
          inputMode="decimal"
        />
        <div className="mt-1 text-xs text-white/70">
          Tu recevras ≈ <b>{estimate}</b> tokens
        </div>
      </div>

      <button
        onClick={doSwap}
        disabled={!wallet || loading}
        className="mt-3 w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {loading ? "Swap..." : "Swap SOL → Token"}
      </button>

      {err && <p className="mt-2 text-sm text-rose-300">{err}</p>}
      {msg && <p className="mt-2 text-sm text-emerald-300">{msg}</p>}
    </div>
  )
}
