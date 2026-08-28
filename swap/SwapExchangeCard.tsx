"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js"
import { solanaConnection } from "@/src/lib/solana/connection"

type PhantomProvider = {
  isPhantom?: boolean
  publicKey?: { toBase58: () => string }
  connect: () => Promise<any>
  disconnect?: () => Promise<void>
  signAndSendTransaction: (tx: Transaction) => Promise<{ signature: string }>
}

type SwapStatus =
  | "idle"
  | "connecting"
  | "building_tx"
  | "signing"
  | "confirming_sol"
  | "calling_api"
  | "done"
  | "error"

const TREASURY_SOL = process.env.NEXT_PUBLIC_TREASURY_SOL || ""
const RATE = Number(process.env.NEXT_PUBLIC_SWAP_RATE_TOKENS_PER_SOL || "0")

function getProvider(): PhantomProvider | null {
  if (typeof window === "undefined") return null
  return (((window as any).phantom?.solana ?? (window as any).solana) as PhantomProvider) ?? null
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function fmt(n: number, d = 2) {
  if (!Number.isFinite(n)) return "0"
  return n.toLocaleString(undefined, { maximumFractionDigits: d })
}

export default function SwapExchangeCard() {
  const providerRef = useRef<PhantomProvider | null>(null)

  const [wallet, setWallet] = useState<string>("")
  const [paySol, setPaySol] = useState<string>("0.10")
  const [slippage, setSlippage] = useState<number>(0.5) // %
  const [status, setStatus] = useState<SwapStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [solSignature, setSolSignature] = useState<string | null>(null)
  const [tokenSignature, setTokenSignature] = useState<string | null>(null)

  const [confirmOpen, setConfirmOpen] = useState(false)

  const [recent, setRecent] = useState<
    Array<{ when: number; sol: number; mac: number; solSig?: string; tokenSig?: string }>
  >([])

  // init provider (client only)
  useEffect(() => {
    const p = getProvider()
    if (p?.isPhantom) {
      providerRef.current = p
      if (p.publicKey) setWallet(p.publicKey.toBase58())
    }
  }, [])

  const solAmount = useMemo(() => {
    const n = Number(paySol.replace(",", "."))
    return Number.isFinite(n) ? n : 0
  }, [paySol])

  const macOut = useMemo(() => {
    if (!RATE || solAmount <= 0) return 0
    return solAmount * RATE
  }, [solAmount])

  const minReceived = useMemo(() => {
    const s = clamp(slippage, 0, 10) / 100
    return macOut * (1 - s)
  }, [macOut, slippage])

  const canSwap = useMemo(() => {
    if (!TREASURY_SOL) return false
    if (!RATE) return false
    if (!wallet) return false
    if (!Number.isFinite(solAmount) || solAmount <= 0) return false
    return status === "idle" || status === "error" || status === "done"
  }, [wallet, solAmount, status])

  const connect = async () => {
    setError(null)
    setSuccess(null)
    setSolSignature(null)
    setTokenSignature(null)

    const p = getProvider()
    if (!p?.isPhantom) return setError("Phantom non détecté.")
    providerRef.current = p

    try {
      setStatus("connecting")
      // petit reset pour éviter les états weird
      try {
        await p.disconnect?.()
      } catch {}

      const resp = await p.connect()
      const pk = resp?.publicKey?.toBase58?.() ?? p.publicKey?.toBase58?.()
      if (!pk) {
        setStatus("error")
        return setError("Connexion OK mais publicKey introuvable.")
      }
      setWallet(pk)
      setStatus("idle")
    } catch (e: any) {
      setStatus("error")
      setError(e?.message ?? "Connexion annulée/échouée.")
    }
  }

  const startSwap = async () => {
    setError(null)
    setSuccess(null)
    setSolSignature(null)
    setTokenSignature(null)

    if (!wallet) return setError("Connecte Phantom d’abord.")
    if (!TREASURY_SOL) return setError("NEXT_PUBLIC_TREASURY_SOL manquant.")
    if (!RATE) return setError("NEXT_PUBLIC_SWAP_RATE_TOKENS_PER_SOL manquant.")
    if (solAmount <= 0) return setError("Montant SOL invalide.")

    const p = providerRef.current ?? getProvider()
    if (!p) return setError("Provider Phantom manquant (reconnecte).")
    providerRef.current = p

    try {
      setConfirmOpen(false)
      setStatus("building_tx")

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

      setStatus("signing")
      const { signature } = await p.signAndSendTransaction(tx)
      setSolSignature(signature)

      setStatus("confirming_sol")
      await solanaConnection.confirmTransaction(signature, "confirmed")

      setStatus("calling_api")
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
        setStatus("error")
        setError(data?.error ?? "Swap échoué (API).")
        return
      }

      setTokenSignature(data.tokenSignature ?? null)
      setStatus("done")

      const tokensSent = Number(data.tokensSent ?? 0)
      setSuccess(`✅ Swap OK : ${fmt(tokensSent, 2)} MAC envoyés.`)

      setRecent((prev) => [
        { when: Date.now(), sol: solAmount, mac: tokensSent || macOut, solSig: signature, tokenSig: data.tokenSignature },
        ...prev,
      ].slice(0, 8))
    } catch (e: any) {
      setStatus("error")
      setError(e?.message ?? "Swap annulé/échoué.")
    }
  }

  const StatusPill = () => {
    const map: Record<SwapStatus, { label: string; cls: string }> = {
      idle: { label: "Prêt", cls: "bg-white/10 text-white/80 border-white/10" },
      connecting: { label: "Connexion…", cls: "bg-blue-500/15 text-blue-100 border-blue-500/30" },
      building_tx: { label: "Préparation…", cls: "bg-white/10 text-white/80 border-white/10" },
      signing: { label: "Signature…", cls: "bg-yellow-500/15 text-yellow-100 border-yellow-500/30" },
      confirming_sol: { label: "Confirmation SOL…", cls: "bg-yellow-500/15 text-yellow-100 border-yellow-500/30" },
      calling_api: { label: "Distribution tokens…", cls: "bg-purple-500/15 text-purple-100 border-purple-500/30" },
      done: { label: "Terminé", cls: "bg-emerald-500/15 text-emerald-100 border-emerald-500/30" },
      error: { label: "Erreur", cls: "bg-rose-500/15 text-rose-100 border-rose-500/30" },
    }
    const s = map[status]
    return (
      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[12px] font-semibold ${s.cls}`}>
        {s.label}
      </span>
    )
  }

  return (
    <div className="w-full">
      {/* header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold">Swap</div>
          <StatusPill />
        </div>

        {!wallet ? (
          <button
            onClick={connect}
            className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
          >
            Connect Phantom
          </button>
        ) : (
          <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/70">
            Wallet: <span className="font-semibold text-white">{wallet.slice(0, 4)}…{wallet.slice(-4)}</span>
          </div>
        )}
      </div>

      {/* panel */}
      <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-5">
        {/* Pay */}
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-white/60">You pay</div>
            <div className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs font-semibold">SOL</div>
          </div>

          <div className="mt-3 flex items-end justify-between gap-3">
            <input
              value={paySol}
              onChange={(e) => setPaySol(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="w-full bg-transparent text-3xl font-semibold outline-none placeholder:text-white/20"
            />
            <div className="text-right text-xs text-white/50">
              Rate: <span className="text-white/80 font-semibold">1 SOL = {RATE || "?"} MAC</span>
            </div>
          </div>

          <div className="mt-2 text-xs text-white/50">
            Tip: garde un peu de SOL pour les fees réseau.
          </div>
        </div>

        {/* Divider / Switch (future) */}
        <div className="my-4 flex items-center justify-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70">
            ↓
          </div>
        </div>

        {/* Receive */}
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-white/60">You receive</div>
            <div className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs font-semibold">MAC</div>
          </div>

          <div className="mt-3 flex items-end justify-between gap-3">
            <div className="text-3xl font-semibold">
              {fmt(macOut, 2)}
            </div>
            <div className="text-right text-xs text-white/50">
              Min received:{" "}
              <span className="text-white/80 font-semibold">{fmt(minReceived, 2)} MAC</span>
            </div>
          </div>

          <div className="mt-2 text-xs text-white/50">
            Basé sur un taux {RATE ? "actuel" : "non défini"}.
          </div>
        </div>

        {/* Slippage */}
        <div className="mt-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-white/80">Slippage</div>
            <div className="text-xs text-white/60">{slippage.toFixed(1)}%</div>
          </div>

          <div className="flex flex-wrap gap-2">
            {[0.1, 0.5, 1.0].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setSlippage(v)}
                className={[
                  "rounded-xl border px-3 py-2 text-xs font-semibold transition",
                  slippage === v
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
                    : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10",
                ].join(" ")}
              >
                {v}%
              </button>
            ))}

            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <span className="text-xs text-white/60">Custom</span>
              <input
                value={String(slippage)}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(",", "."))
                  if (!Number.isFinite(n)) return
                  setSlippage(clamp(n, 0, 10))
                }}
                className="w-16 bg-transparent text-xs font-semibold outline-none"
                inputMode="decimal"
              />
              <span className="text-xs text-white/60">%</span>
            </div>
          </div>
        </div>

        {/* Preview / Swap */}
        <div className="mt-5">
          <button
            type="button"
            disabled={!wallet || solAmount <= 0 || !TREASURY_SOL || !RATE || (status !== "idle" && status !== "error" && status !== "done")}
            onClick={() => setConfirmOpen(true)}
            className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            Preview Swap
          </button>

          {!TREASURY_SOL || !RATE ? (
            <div className="mt-2 text-xs text-rose-200">
              ⚠️ Variables env manquantes :{" "}
              {!TREASURY_SOL ? "NEXT_PUBLIC_TREASURY_SOL " : ""}
              {!RATE ? "NEXT_PUBLIC_SWAP_RATE_TOKENS_PER_SOL" : ""}
            </div>
          ) : null}
        </div>

        {/* status details */}
        <div className="mt-4 space-y-2 text-xs text-white/60">
          {solSignature ? <div>Tx SOL: <span className="text-white/80">{solSignature}</span></div> : null}
          {tokenSignature ? <div>Tx Token: <span className="text-white/80">{tokenSignature}</span></div> : null}
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
            <b>Erreur :</b> {error}
          </div>
        ) : null}

        {success ? (
          <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            {success}
          </div>
        ) : null}
      </div>

      {/* Recent */}
      <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-white/80">Recent swaps</div>
          <button
            type="button"
            onClick={() => setRecent([])}
            className="text-xs text-white/50 hover:text-white/70"
          >
            Clear
          </button>
        </div>

        {recent.length === 0 ? (
          <div className="mt-3 text-xs text-white/50">Aucun swap récent.</div>
        ) : (
          <div className="mt-3 space-y-2">
            {recent.map((r) => (
              <div
                key={r.when}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs"
              >
                <div className="text-white/70">
                  {new Date(r.when).toLocaleString()}
                </div>
                <div className="text-white/80 font-semibold">
                  {fmt(r.sol, 3)} SOL → {fmt(r.mac, 2)} MAC
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirm modal */}
      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => (status === "idle" || status === "error" || status === "done") && setConfirmOpen(false)}
          />
          <div className="relative w-full max-w-[520px] rounded-3xl border border-white/10 bg-[#0b0f14]/95 p-6 shadow-[0_30px_120px_rgba(0,0,0,0.8)] backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Confirm swap</div>
                <div className="mt-1 text-xs text-white/60">
                  Vérifie les détails avant signature.
                </div>
              </div>
              <button
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 hover:bg-white/10"
                onClick={() => (status === "idle" || status === "error" || status === "done") && setConfirmOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-white/60">You pay</span>
                <span className="font-semibold">{fmt(solAmount, 4)} SOL</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-white/60">You receive</span>
                <span className="font-semibold">{fmt(macOut, 2)} MAC</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-white/60">Min received</span>
                <span className="font-semibold">{fmt(minReceived, 2)} MAC</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-white/60">Slippage</span>
                <span className="font-semibold">{slippage.toFixed(1)}%</span>
              </div>
            </div>

            <button
              type="button"
              disabled={!canSwap}
              onClick={startSwap}
              className="mt-5 w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {wallet ? "Confirm & Swap" : "Connect Phantom"}
            </button>

            {!wallet ? (
              <button
                type="button"
                onClick={connect}
                className="mt-3 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/80 hover:bg-white/10"
              >
                Connect Phantom
              </button>
            ) : null}

            {(status !== "idle" && status !== "error" && status !== "done") ? (
              <div className="mt-4 text-xs text-white/60">
                Progress: <span className="text-white/80 font-semibold">{status}</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
