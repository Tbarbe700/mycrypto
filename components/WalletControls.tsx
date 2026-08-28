"use client"

import { useEffect, useMemo, useRef, useState } from "react"

type PhantomProvider = {
  isPhantom?: boolean
  publicKey?: { toBase58: () => string }
  connect: () => Promise<any>
  disconnect?: () => Promise<void>
  on?: (event: "connect" | "disconnect" | "accountChanged", handler: any) => void
  removeListener?: (
    event: "connect" | "disconnect" | "accountChanged",
    handler: any
  ) => void
}

function short(pk: string) {
  return `${pk.slice(0, 4)}...${pk.slice(-4)}`
}

function getProvider(): PhantomProvider | null {
  const p = (window as any).phantom?.solana ?? (window as any).solana
  return p ?? null
}

export default function WalletControls() {
  const [wallet, setWallet] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const providerRef = useRef<PhantomProvider | null>(null)

  const isConnected = useMemo(() => Boolean(wallet), [wallet])

  // ✅ Detect provider + keep UI synced with Phantom events
  useEffect(() => {
    const provider = getProvider()

    if (provider?.isPhantom) {
      providerRef.current = provider

      // If already connected (refresh safe)
      if (provider.publicKey) {
        setWallet(provider.publicKey.toBase58())
      }

      const handleConnect = (resp: any) => {
        const pk =
          resp?.publicKey?.toBase58?.() ?? provider.publicKey?.toBase58?.()
        if (pk) setWallet(pk)
      }

      const handleDisconnect = () => {
        setWallet("")
      }

      const handleAccountChanged = (newPublicKey: any) => {
        const pk = newPublicKey?.toBase58?.()
        setWallet(pk ?? "")
      }

      provider.on?.("connect", handleConnect)
      provider.on?.("disconnect", handleDisconnect)
      provider.on?.("accountChanged", handleAccountChanged)

      return () => {
        provider.removeListener?.("connect", handleConnect)
        provider.removeListener?.("disconnect", handleDisconnect)
        provider.removeListener?.("accountChanged", handleAccountChanged)
      }
    }
  }, [])

  const connect = async () => {
    setLoading(true)
    try {
      const provider = getProvider()

      if (!provider?.isPhantom) {
        alert("Phantom n’est pas installé")
        return
      }

      providerRef.current = provider

      const resp = await provider.connect()
      const pk =
        resp?.publicKey?.toBase58?.() ?? provider.publicKey?.toBase58?.()

      if (!pk) throw new Error("Impossible de récupérer la clé publique")

      setWallet(pk)

      // ✅ link wallet server-side (user <-> wallet)
      await fetch("/api/solana/link-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: pk }),
      })
    } catch (e) {
      console.error("Phantom connect error:", e)
      alert("Connexion Phantom échouée")
    } finally {
      setLoading(false)
    }
  }

  const disconnect = async () => {
    try {
      await providerRef.current?.disconnect?.()
    } catch {
      // Phantom peut throw sans gravité
    } finally {
      providerRef.current = null
      setWallet("")
    }
  }

  return (
    <div className="flex items-center gap-3">
      {isConnected ? (
        <>
          <div
            className="
              inline-flex items-center gap-2
              rounded-xl border border-white/15
              bg-black/25 px-3 py-2
              text-sm font-semibold text-white/80
              shadow-[0_0_0_1px_rgba(255,255,255,0.06)_inset]
            "
            title={wallet}
          >
            <span className="h-2 w-2 rounded-full bg-emerald-400/80" />
            <span>{short(wallet)}</span>
          </div>

          <button
            onClick={disconnect}
            className="
              inline-flex items-center justify-center
              rounded-xl px-4 py-2 text-sm font-semibold
              text-white/75
              border border-white/15
              bg-white/5
              hover:text-white hover:border-white/25
              transition
              active:translate-y-[1px]
            "
          >
            Disconnect
          </button>
        </>
      ) : (
        <button
          onClick={connect}
          disabled={loading}
          className="
            relative inline-flex items-center justify-center
            rounded-xl px-4 py-2 text-sm font-semibold
            text-white/90
            border border-white/20
            bg-gradient-to-b from-white/10 to-white/5
            shadow-[0_8px_30px_rgba(0,0,0,0.45)]
            hover:border-white/30 hover:text-white
            hover:shadow-[0_10px_40px_rgba(0,0,0,0.6)]
            active:translate-y-[1px]
            transition
            disabled:opacity-60 disabled:cursor-not-allowed
          "
        >
          <span className="pointer-events-none absolute inset-0 rounded-xl shadow-[0_0_0_1px_rgba(255,255,255,0.06)_inset]" />
          {loading ? "Connexion..." : "Connect Wallet"}
        </button>
      )}
    </div>
  )
}
