"use client"

import { useEffect, useMemo, useState } from "react"
import { Connection, PublicKey } from "@solana/web3.js"
import { getAssociatedTokenAddress, getAccount, getMint } from "@solana/spl-token"

const RPC = process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com"
const MINT = process.env.NEXT_PUBLIC_TOKEN_MINT || ""

type PhantomProvider = {
  isPhantom?: boolean
  publicKey?: { toBase58: () => string }
  connect: () => Promise<any>
}

function getProvider(): PhantomProvider | null {
  if (typeof window === "undefined") return null
  return (((window as any).phantom?.solana ?? (window as any).solana) as PhantomProvider) ?? null
}

function short(pk: string) {
  return `${pk.slice(0, 4)}...${pk.slice(-4)}`
}

function formatFromRaw(raw: bigint, decimals: number, digits = 2) {
  // Convertit un bigint "raw" vers un string ui sans perte
  const base = 10n ** BigInt(decimals)
  const whole = raw / base
  const frac = raw % base

  // on prend juste quelques digits (digits) pour l'affichage
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, digits)
  return `${whole.toString()}.${fracStr}`
}

export default function TokenBalance() {
  const [wallet, setWallet] = useState("")
  const [balanceUi, setBalanceUi] = useState<string>("—")
  const [decimals, setDecimals] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const connection = useMemo(() => new Connection(RPC, "confirmed"), [])

  // auto-detect si déjà connecté
  useEffect(() => {
    const p = getProvider()
    if (p?.isPhantom && p.publicKey) {
      setWallet(p.publicKey.toBase58())
    }
  }, [])

  async function loadDecimals() {
    if (!MINT) throw new Error("NEXT_PUBLIC_TOKEN_MINT manquant")
    const mintPk = new PublicKey(MINT)
    const mintInfo = await getMint(connection, mintPk)
    return mintInfo.decimals
  }

  const refresh = async (addr: string) => {
    setErr(null)
    setLoading(true)
    try {
      if (!addr) {
        setBalanceUi("—")
        return
      }
      if (!MINT) throw new Error("NEXT_PUBLIC_TOKEN_MINT manquant")

      // decimals mint (cache local state)
      let d = decimals
      if (d === null) {
        d = await loadDecimals()
        setDecimals(d)
      }

      const mintPk = new PublicKey(MINT)
      const ownerPk = new PublicKey(addr)

      const ata = await getAssociatedTokenAddress(mintPk, ownerPk)
      const info = await connection.getAccountInfo(ata)

      if (!info) {
        setBalanceUi(`0.00`)
        return
      }

      const acc = await getAccount(connection, ata)
      const raw = acc.amount // bigint
      setBalanceUi(formatFromRaw(raw, d, 2))
    } catch (e: any) {
      setErr(e?.message ?? "Erreur lecture solde")
      setBalanceUi("—")
    } finally {
      setLoading(false)
    }
  }

  // refresh quand wallet change
  useEffect(() => {
    refresh(wallet)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet])

  const connect = async () => {
    setErr(null)
    try {
      const p = getProvider()
      if (!p?.isPhantom) throw new Error("Phantom non détecté.")
      const resp = await p.connect()
      const pk = resp?.publicKey?.toBase58?.() ?? p.publicKey?.toBase58?.()
      if (!pk) throw new Error("PublicKey introuvable.")
      setWallet(pk)
    } catch (e: any) {
      setErr(e?.message ?? "Connexion refusée.")
    }
  }

  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Wallet Phantom</h2>
        <button
          onClick={() => refresh(wallet)}
          disabled={!wallet || loading}
          className="text-xs text-slate-500 hover:text-slate-800 disabled:opacity-50"
        >
          {loading ? "…" : "Refresh"}
        </button>
      </div>

      {!wallet ? (
        <button
          onClick={connect}
          className="mt-3 w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Connecter Phantom
        </button>
      ) : (
        <>
          <div className="mt-3 text-xs text-slate-600">
            Adresse: <b>{short(wallet)}</b>
          </div>

          <div className="mt-2 text-lg font-semibold text-slate-900">
            {balanceUi} MAC
          </div>

          <div className="mt-1 text-xs text-slate-500">
            Solde MaCrypto (devnet){decimals !== null ? ` • decimals=${decimals}` : ""}
          </div>
        </>
      )}

      {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
    </div>
  )
}
