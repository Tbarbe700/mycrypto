"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { Connection, PublicKey, Transaction } from "@solana/web3.js"
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
} from "@solana/spl-token"

import WalletControls from "@/app/components/WalletControls"
import RuneIcon from "@/app/components/RuneIcon"

type Drop = {
  itemId: string
  rarity: string
  name: string
  baseRate: number
  runeType?: string | null
}

type ChestKey = "C1" | "C2" | "C3"

const RPC = process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com"
const MINT = process.env.NEXT_PUBLIC_TOKEN_MINT || ""
const TREASURY = process.env.NEXT_PUBLIC_TREASURY_SOL || ""
const DECIMALS = Number(process.env.NEXT_PUBLIC_TOKEN_DECIMALS ?? 9)

const CHESTS: Record<
  ChestKey,
  { title: string; price: number; count: number; img: string; accent: string }
> = {
  C1: { title: "Coffre 1", price: 50, count: 1, img: "/img/chests/c1.png", accent: "from-orange-500/30" },
  C2: { title: "Coffre 2", price: 120, count: 3, img: "/img/chests/c2.png", accent: "from-sky-400/25" },
  C3: { title: "Coffre 3", price: 250, count: 5, img: "/img/chests/c3.png", accent: "from-violet-500/25" },
}

type PhantomProvider = {
  isPhantom?: boolean
  publicKey?: PublicKey
  connect: () => Promise<any>
  signAndSendTransaction: (tx: Transaction) => Promise<{ signature: string }>
  disconnect?: () => Promise<void> | void
}

function getProvider(): PhantomProvider | null {
  if (typeof window === "undefined") return null
  return (((window as any).phantom?.solana ?? (window as any).solana) as PhantomProvider) ?? null
}

function toRawAmount(ui: number, decimals: number): bigint {
  return BigInt(Math.round(ui)) * (10n ** BigInt(decimals))
}

function normalizePath(pathname: string) {
  const p = pathname.split("?")[0].split("#")[0]
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p
}

function Card({
  title,
  subtitle,
  children,
}: {
  title?: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/40 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur">
      {title ? (
        <div className="mb-4">
          <div className="text-sm font-semibold text-white/95">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-white/55">{subtitle}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  )
}

function ChestCard({
  title,
  price,
  count,
  img,
  accent,
  disabled,
  onClick,
}: {
  title: string
  price: number
  count: number
  img: string
  accent: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] text-left transition hover:bg-white/[0.05] disabled:opacity-60"
    >
      {/* top image */}
      <div className="relative h-[160px] w-full">
        <img src={img} alt={title} className="h-full w-full object-cover" draggable={false} />
        {/* overlay gradients */}
        <div className={`pointer-events-none absolute inset-0 bg-gradient-to-b ${accent} via-black/10 to-black/80`} />
        <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100 bg-[radial-gradient(circle_at_50%_35%,rgba(16,185,129,0.20),transparent_55%)]" />
      </div>

      {/* content */}
      <div className="p-5">
        <div className="text-sm font-semibold text-white">{title}</div>
        <div className="mt-1 text-sm text-white/70">Prix: {price} MAC</div>
        <div className="text-xs text-white/50">Contient: {count} item{count > 1 ? "s" : ""}</div>

        <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100">
          Acheter
          <span className="opacity-70">→</span>
        </div>
      </div>
    </button>
  )
}

export default function ChestClient({ initialBalance }: { initialBalance: number }) {
  const pathnameRaw = usePathname()
  const pathname = normalizePath(pathnameRaw || "")

  const menu = [
    { label: "FARM", href: "/farm" },
    { label: "INVENTORY", href: "/inventory-v2" },
    { label: "SWAP", href: "/swap" },
    { label: "CHESTS", href: "/chests" },
    { label: "REFERRAL", href: "/referral" },
  ] as const

  const [balance, setBalance] = useState(initialBalance)
  const [macBalance, setMacBalance] = useState<number | null>(null)

  const [drops, setDrops] = useState<Drop[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const provider = useMemo(() => getProvider(), [])
  const connection = useMemo(() => new Connection(RPC, "confirmed"), [])

  async function refreshMacBalance(ownerPk: PublicKey) {
    if (!MINT) return
    const mintPk = new PublicKey(MINT)

    try {
      const ata = await getAssociatedTokenAddress(mintPk, ownerPk)
      const res = await connection.getTokenAccountBalance(ata)
      const ui = res?.value?.uiAmount
      if (ui === null || ui === undefined) setMacBalance(0)
      else setMacBalance(ui)
    } catch {
      setMacBalance(0)
    }
  }

  async function ensureConnected(): Promise<PublicKey> {
    if (!provider?.isPhantom) throw new Error("Phantom n’est pas détecté.")
    if (!provider.publicKey) await provider.connect()
    const pk = provider.publicKey
    if (!pk) throw new Error("Wallet non connecté.")
    await refreshMacBalance(pk)
    return pk
  }

  useEffect(() => {
    ;(async () => {
      try {
        if (!provider?.isPhantom) return
        if (provider.publicKey) await refreshMacBalance(provider.publicKey)
        else setMacBalance(null)
      } catch {
        setMacBalance(null)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function buy(chest: ChestKey) {
    setLoading(true)
    setError(null)
    setDrops([])

    try {
      if (!MINT || !TREASURY) throw new Error("ENV manquante: NEXT_PUBLIC_TOKEN_MINT / NEXT_PUBLIC_TREASURY_SOL")
      if (!Number.isFinite(DECIMALS) || DECIMALS < 0 || DECIMALS > 18) {
        throw new Error("DECIMALS invalide (NEXT_PUBLIC_TOKEN_DECIMALS).")
      }

      const payerPk = await ensureConnected()

      const cfg = CHESTS[chest]
      const mintPk = new PublicKey(MINT)
      const treasuryOwnerPk = new PublicKey(TREASURY)

      const payerAta = await getAssociatedTokenAddress(mintPk, payerPk)
      const treasuryAta = await getAssociatedTokenAddress(mintPk, treasuryOwnerPk)

      const payerInfo = await connection.getAccountInfo(payerAta)
      if (!payerInfo) throw new Error("Ton wallet n’a pas d’ATA pour ce token (MAC). Reçois au moins 1 MAC d’abord.")

      const tx = new Transaction()

      const treasuryInfo = await connection.getAccountInfo(treasuryAta)
      if (!treasuryInfo) {
        tx.add(createAssociatedTokenAccountInstruction(payerPk, treasuryAta, treasuryOwnerPk, mintPk))
      }

      const amountRaw = toRawAmount(cfg.price, DECIMALS)
      tx.add(createTransferCheckedInstruction(payerAta, mintPk, treasuryAta, payerPk, amountRaw, DECIMALS))

      tx.feePayer = payerPk
      const { blockhash } = await connection.getLatestBlockhash("confirmed")
      tx.recentBlockhash = blockhash

      const sent = await provider!.signAndSendTransaction(tx)
      const signature = sent.signature
      await connection.confirmTransaction(signature, "confirmed")

      const res = await fetch("/api/chests/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chest,
          signature,
          payer: payerPk.toBase58(),
          mint: MINT,
          treasury: TREASURY,
          decimals: DECIMALS,
          expectedUi: cfg.price,
          expectedRaw: amountRaw.toString(),
          payerAta: payerAta.toBase58(),
          treasuryAta: treasuryAta.toBase58(),
        }),
      })

      const text = await res.text()
      let data: any = null
      try {
        data = text ? JSON.parse(text) : null
      } catch {
        data = null
      }

      if (!res.ok) {
        console.error("BUY CHEST ERROR", res.status, text)
        if (data) console.error("BUY CHEST DEBUG:", data)
        throw new Error(data?.error || `Erreur achat coffre (${res.status})`)
      }

      if (typeof data?.balance === "number") setBalance(data.balance)
      setDrops((data?.drops || []) as Drop[])
      await refreshMacBalance(payerPk)
    } catch (e: any) {
      setError(e?.message || "Erreur inconnue")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* TOP BAR */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/35 px-4 py-3 backdrop-blur">
          {menu.map((t) => {
            const active = pathname === t.href
            return (
              <Link
                key={t.label}
                href={t.href}
                className={[
                  "rounded-xl px-4 py-2 text-xs font-semibold tracking-widest transition",
                  active ? "bg-white/10 text-white" : "text-white/65 hover:text-white hover:bg-white/5",
                ].join(" ")}
              >
                {t.label}
              </Link>
            )
          })}
        </div>

        <WalletControls />
      </div>

      {/* BALANCES */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Balance (Wallet Phantom)" subtitle="On-chain SPL token">
          <div className="mt-1 text-3xl font-semibold">
            {macBalance === null ? "—" : macBalance.toFixed(2)} <span className="text-white/70">MAC</span>
          </div>
        </Card>

        <Card title="Balance (DB legacy)" subtitle="Ne sert plus à payer les coffres">
          <div className="mt-1 text-3xl font-semibold">{balance.toFixed(2)}</div>
        </Card>
      </div>

      {/* CHESTS */}
      <Card title="Coffres" subtitle="Achète et reçois des drops aléatoires.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <ChestCard
            title={CHESTS.C1.title}
            price={CHESTS.C1.price}
            count={CHESTS.C1.count}
            img={CHESTS.C1.img}
            accent={CHESTS.C1.accent}
            disabled={loading}
            onClick={() => buy("C1")}
          />
          <ChestCard
            title={CHESTS.C2.title}
            price={CHESTS.C2.price}
            count={CHESTS.C2.count}
            img={CHESTS.C2.img}
            accent={CHESTS.C2.accent}
            disabled={loading}
            onClick={() => buy("C2")}
          />
          <ChestCard
            title={CHESTS.C3.title}
            price={CHESTS.C3.price}
            count={CHESTS.C3.count}
            img={CHESTS.C3.img}
            accent={CHESTS.C3.accent}
            disabled={loading}
            onClick={() => buy("C3")}
          />
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
            {error}
          </div>
        ) : null}
      </Card>

      {/* DROPS */}
      {drops.length > 0 ? (
        <Card title="Drops" subtitle="Résultat de ton dernier coffre.">
          <ul className="space-y-2">
            {drops.map((d, i) => (
              <li
                key={`${d.itemId}-${i}`}
                className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3"
              >
                <RuneIcon runeType={d.runeType} rarity={d.rarity} size={58} />
                <div className="min-w-0">
                  <div className="font-semibold">{d.name}</div>
                  <div className="text-xs text-white/60">
                    {d.rarity} • baseRate {d.baseRate}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  )
}