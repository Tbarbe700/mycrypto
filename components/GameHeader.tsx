"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { useWallet } from "@/app/components/solana/WalletContext"

type NavItem = { label: string; href: string }

const nav: NavItem[] = [
  { label: "How to Play", href: "/how-to-play" },
  { label: "Marketplace", href: "/marketplace" },
  { label: "Economy", href: "/economy" },
  { label: "FAQ", href: "/faq" },
]

type PhantomProvider = {
  isPhantom?: boolean
  publicKey?: { toBase58: () => string }
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<any>
  disconnect?: () => Promise<void>
  signMessage?: (message: Uint8Array, display?: "utf8" | "hex") => Promise<{
    signature: Uint8Array
    publicKey: any
  }>
  on?: (event: "connect" | "disconnect" | "accountChanged", handler: any) => void
  removeListener?: (
    event: "connect" | "disconnect" | "accountChanged",
    handler: any
  ) => void
}

function getProvider(): PhantomProvider | null {
  const p = (window as any).phantom?.solana ?? (window as any).solana
  return p ?? null
}

function short(pk: string) {
  return `${pk.slice(0, 4)}...${pk.slice(-4)}`
}

function toHex(u8: Uint8Array) {
  return Array.from(u8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

function isUserRejectError(e: any) {
  const msg = String(e?.message ?? "").toLowerCase()
  const code = e?.code
  return (
    code === 4001 ||
    msg.includes("user rejected") ||
    msg.includes("user denied") ||
    msg.includes("rejected") ||
    msg.includes("declined") ||
    msg.includes("cancel")
  )
}

export default function GameHeader({ showSignIn = true }: { showSignIn?: boolean }) {
  const { wallet, setWallet, clearWallet, isConnected } = useWallet()
  const [loading, setLoading] = useState(false)
  const providerRef = useRef<PhantomProvider | null>(null)

  // ✅ Detect Phantom + keep UI synced with events
  // ⚠️ We do NOT auto-set wallet on refresh to respect Disconnect
  useEffect(() => {
    const provider = getProvider()
    if (!provider?.isPhantom) return

    providerRef.current = provider

    const handleConnect = (_resp: any) => {
      // Intentionally no setWallet here: we only accept after signature in connect()
    }

    const handleDisconnect = () => {
      clearWallet()
    }

    const handleAccountChanged = (newPublicKey: any) => {
      // If wallet already connected and user switches account in Phantom,
      // reflect it in UI. (Optional behavior, but generally good.)
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
  }, [setWallet, clearWallet])

  const connect = async () => {
    setLoading(true)
    try {
      const provider = getProvider()

      if (!provider?.isPhantom) {
        alert("Phantom n’est pas installé")
        return
      }

      providerRef.current = provider

      // 1) Connect (can be silent if already trusted)
      const resp = await provider.connect({ onlyIfTrusted: false })
      const pk =
        resp?.publicKey?.toBase58?.() ?? provider.publicKey?.toBase58?.()

      if (!pk) throw new Error("Impossible de récupérer la clé publique")

      // 2) Force a Phantom prompt EVERY TIME via signMessage
      if (provider.signMessage) {
        const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`
        const message = `DRAKRUN LOGIN\nWallet: ${pk}\nNonce: ${nonce}`
        const encoded = new TextEncoder().encode(message)

        try {
          const signed = await provider.signMessage(encoded, "utf8")
          const signatureHex = toHex(signed.signature)

          // ✅ Accept wallet only after signature
          setWallet(pk)

          await fetch("/api/solana/link-wallet", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ wallet: pk, nonce, signature: signatureHex }),
          })

          return
        } catch (e) {
          // ❌ signature refused => treat as NOT connected
          try {
            await provider.disconnect?.()
          } catch {
            // ignore
          } finally {
            providerRef.current = null
            clearWallet()
          }

          if (isUserRejectError(e)) {
            alert("Signature annulée — connexion annulée.")
            return
          }

          console.error("Signature error:", e)
          alert("Erreur lors de la signature — connexion annulée.")
          return
        }
      }

      // Fallback: if signMessage doesn't exist, accept connection (less strict)
      setWallet(pk)
      await fetch("/api/solana/link-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: pk }),
      })
    } catch (e) {
      console.error("Phantom connect error:", e)
      alert("Connexion Phantom échouée")
      providerRef.current = null
      clearWallet()
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
      clearWallet()
    }
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <div
        className="
          relative
          border-b border-white/10
          bg-gradient-to-b from-black/70 to-black/35
          backdrop-blur-md
        "
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/10" />

        <div className="mx-auto grid h-[74px] max-w-7xl grid-cols-[1fr_auto_1fr] items-center px-4 sm:px-6">
          {/* LEFT */}
          <div className="flex items-center justify-start gap-4">
            <Link href="/" className="flex items-center gap-3 md:hidden" aria-label="Home">
              <span
                className="
                  grid h-8 w-8 place-items-center rounded-lg
                  border border-white/20 bg-white/5
                  shadow-[0_0_0_1px_rgba(255,255,255,0.06)_inset]
                "
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 2l9 10-9 10L3 12 12 2z"
                    stroke="rgba(255,255,255,0.75)"
                    strokeWidth="1.5"
                  />
                </svg>
              </span>
              <span className="text-sm font-semibold tracking-[0.22em] text-white/85">
                DRAKRUN
              </span>
            </Link>

            <nav className="hidden items-center gap-8 md:flex">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="
                    text-sm text-white/60
                    transition
                    hover:text-white
                    hover:drop-shadow-[0_0_12px_rgba(255,180,80,0.35)]
                  "
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* CENTER LOGO */}
          <div className="flex items-center justify-center">
            <Link href="/" aria-label="Home" className="relative">
              <img
                src="/img/brand/drakrun-logo.png"
                alt="Drakrun"
                className="h-[106px] w-auto drop-shadow-[0_10px_30px_rgba(0,0,0,0.6)]"
                loading="eager"
                draggable={false}
              />
            </Link>
          </div>

          {/* RIGHT */}
          <div className="flex items-center justify-end gap-3">
            {isConnected ? (
              <>
                <div
                  className="
                    hidden sm:inline-flex items-center gap-2
                    rounded-xl border border-white/15
                    bg-black/25 px-3 py-2
                    text-sm font-semibold text-white/85
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
                    text-white/70
                    border border-white/15
                    bg-transparent
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
                  rounded-xl px-5 py-2 text-sm font-semibold
                  text-black
                  bg-gradient-to-b from-amber-200 to-amber-400
                  shadow-[0_8px_30px_rgba(255,180,80,0.35)]
                  hover:from-amber-300 hover:to-amber-500
                  active:translate-y-[1px]
                  transition
                  disabled:opacity-60 disabled:cursor-not-allowed
                "
              >
                {loading ? "Connexion..." : "Connect Wallet"}
              </button>
            )}

            {showSignIn && (
              <Link
                href="/signin"
                className="
                  hidden sm:inline-flex items-center justify-center
                  rounded-xl px-4 py-2 text-sm font-semibold
                  text-white/70
                  border border-white/15
                  bg-transparent
                  hover:text-white hover:border-white/25
                  transition
                "
              >
                Sign In
              </Link>
            )}

            <button
              className="
                md:hidden
                ml-1 grid h-10 w-10 place-items-center rounded-xl
                border border-white/15 bg-white/5
                text-white/80 hover:text-white hover:border-white/25
                transition
              "
              aria-label="Open menu"
              type="button"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 7h16M4 12h16M4 17h16"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="h-px bg-white/20" />
        <div className="h-px bg-black/40" />
      </div>
    </header>
  )
}
