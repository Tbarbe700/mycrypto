"use client"

import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import WalletControls from "@/app/components/WalletControls"
import RuneIcon from "@/app/components/RuneIcon"

import RepairButton from "@/app/farm/RepairButton"
import UpgradeButton from "@/app/farm/UpgradeButton"

type UIItem = {
  id: string
  equipped: boolean
  hp: number
  pendingEarned: number
  lastItemDecayAtIso: string | null
  item: {
    name: string
    rarity: string
    baseRate: number
    runeType: string | null
  }
}

type Props = {
  player: {
    level: number
    character: string
    pendingBalance: number
    lastClaimedAtIso: string
    slotMax: number
  }
  gainPerSec: number
  nextUpgradeCost: number | null
  equipped: UIItem[]
  inventory: UIItem[]
}

const MAX_INVENTORY = 40

const CLAIM_ALL_INVENTORY_ACTION = "/api/items/claim-all"
const SELL_ALL_INVENTORY_ACTION = "/api/items/sell-all"

function normalizePath(pathname: string) {
  const p = pathname.split("?")[0].split("#")[0]
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x))
}

function gainFor(baseRate: number, hp: number) {
  const br = Number(baseRate) || 0
  const h = Number(hp) || 0
  return br * clamp01(h / 100)
}

function safeNum(x: any, fallback = 0) {
  const n = typeof x === "number" ? x : Number(x)
  return Number.isFinite(n) ? n : fallback
}

function rarityTag(r: string) {
  switch (r) {
    case "RARE":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
    case "EPIC":
      return "border-violet-400/30 bg-violet-400/10 text-violet-200"
    case "LEGENDARY":
      return "border-amber-400/30 bg-amber-400/10 text-amber-200"
    default:
      return "border-white/10 bg-white/5 text-white/75"
  }
}

function upgradeCostForRarity(r: string) {
  switch (r) {
    case "COMMON":
      return 25
    case "RARE":
      return 75
    case "EPIC":
      return 200
    case "LEGENDARY":
      return 500
    default:
      return 50
  }
}

function sellPriceForRarity(r: string) {
  switch (r) {
    case "COMMON":
      return 10
    case "RARE":
      return 30
    case "EPIC":
      return 80
    case "LEGENDARY":
      return 200
    default:
      return 5
  }
}

function fmt(n: number, d = 2) {
  if (!Number.isFinite(n)) return "0"
  return n.toLocaleString(undefined, { maximumFractionDigits: d })
}

function Card({
  title,
  subtitle,
  right,
  children,
}: {
  title?: string
  subtitle?: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/40 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur">
      {title ? (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-white/95">{title}</div>
            {subtitle ? <div className="mt-1 text-xs text-white/55">{subtitle}</div> : null}
          </div>
          {right ? <div className="shrink-0">{right}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  )
}

function HpPill({ hp }: { hp: number }) {
  const val = Math.max(0, Math.min(100, Math.round(hp)))
  const danger = val < 30
  return (
    <div
      className={[
        "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
        danger ? "border-rose-500/30 bg-rose-500/10 text-rose-200" : "border-white/10 bg-white/5 text-white/70",
      ].join(" ")}
      title={`HP ${val}%`}
    >
      {val}%
    </div>
  )
}

function Slot({
  active,
  onClick,
  children,
  topRight,
}: {
  active?: boolean
  onClick?: () => void
  children?: React.ReactNode
  topRight?: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "group relative w-full overflow-hidden rounded-2xl border transition",
        "bg-white/[0.035] hover:bg-white/[0.06]",
        "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.035)]",
        active ? "border-emerald-400/55 ring-1 ring-emerald-400/25" : "border-white/10",
      ].join(" ")}
      style={{
        // un peu plus “haut” que ton ancien 3/2, ça rend mieux pour les cartes/runes verticales
        aspectRatio: "1.9 / 1",
      }}
    >
      {/* subtle highlight */}
      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100 bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.08),transparent_55%)]" />

      {topRight ? <div className="absolute right-2 top-2 z-10">{topRight}</div> : null}

      <div className="flex h-full w-full items-center justify-center p-2">{children}</div>
    </button>
  )
}

export default function InventoryClient({ player, equipped, inventory }: Props) {
  const pathnameRaw = usePathname()
  const pathname = normalizePath(pathnameRaw || "")

  const menu = [
    { label: "FARM", href: "/farm" },
    { label: "INVENTORY", href: "/inventory-v2" },
    { label: "SWAP", href: "/swap" },
    { label: "CHESTS", href: "/chests" },
    { label: "REFERRAL", href: "/referral" },
  ] as const

  const pendingInventoryTotal = React.useMemo(
    () => inventory.reduce((sum, it) => sum + safeNum(it.pendingEarned, 0), 0),
    [inventory]
  )

  const sellAllInventoryTotal = React.useMemo(() => {
    return inventory.reduce((sum, it) => {
      const pending = safeNum(it.pendingEarned, 0)
      const sellPrice = sellPriceForRarity(it.item.rarity)
      return sum + pending + sellPrice
    }, 0)
  }, [inventory])

  const initialSelected = equipped[0]?.id ?? inventory[0]?.id ?? null
  const [selectedId, setSelectedId] = React.useState<string | null>(initialSelected)

  React.useEffect(() => {
    if (!selectedId) return
    const exists = equipped.some((x) => x.id === selectedId) || inventory.some((x) => x.id === selectedId)
    if (!exists) setSelectedId(equipped[0]?.id ?? inventory[0]?.id ?? null)
  }, [equipped, inventory, selectedId])

  const selected =
    equipped.find((x) => x.id === selectedId) ?? inventory.find((x) => x.id === selectedId) ?? null

  const equippedGainPerSec = React.useMemo(() => {
    return equipped.reduce((sum, it) => sum + gainFor(it.item.baseRate, it.hp), 0)
  }, [equipped])

  const selectedGainPerSec = React.useMemo(() => {
    if (!selected) return 0
    return gainFor(selected.item.baseRate, selected.hp)
  }, [selected])

  const deltaIfToggleEquip = React.useMemo(() => {
    if (!selected) return 0
    return selected.equipped ? -selectedGainPerSec : selectedGainPerSec
  }, [selected, selectedGainPerSec])

  return (
    <main className="min-h-screen bg-[#07090A] text-white">
      {/* subtle background */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(16,185,129,0.18),transparent_45%),radial-gradient(circle_at_80%_30%,rgba(255,255,255,0.06),transparent_40%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/25 to-black/60" />
      </div>

      <div className="mx-auto w-full max-w-[1400px] px-6 py-8">
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

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[440px_1fr]">
          {/* LEFT */}
          <div className="space-y-6">
            <Card title="Stats" subtitle="Aperçu en temps réel (selon l’item sélectionné).">
              <div className="grid grid-cols-2 gap-3">
                <StatTile label="Total équipé" value={`${fmt(equippedGainPerSec, 2)}/s`} />
                <StatTile label="Item sélectionné" value={`${fmt(selectedGainPerSec, 2)}/s`} />
                <StatTile
                  label="Impact (toggle)"
                  value={`${deltaIfToggleEquip >= 0 ? "+" : ""}${fmt(deltaIfToggleEquip, 2)}/s`}
                  emphasize={deltaIfToggleEquip !== 0}
                />
                <StatTile label="HP" value={selected ? `${Math.round(selected.hp)}%` : "—"} />
              </div>

              <div className="mt-4 text-[11px] text-white/55">
                Impact = variation estimée si tu <b>équipes</b> ou <b>déséquipes</b> l’item.
              </div>
            </Card>

            <Card title="Sélection" subtitle={selected ? "Détails & actions" : "Aucun item sélectionné."}>
              {!selected ? (
                <div className="text-white/60">Sélectionne un item à droite.</div>
              ) : (
                <>
                  {/* HERO header */}
                  <div className="flex items-center gap-5">
                    <RuneIcon runeType={selected.item.runeType} rarity={selected.item.rarity} size={110} />

                    <div className="min-w-0">
                      <div className="truncate text-xl font-semibold">{selected.item.name}</div>

                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/65">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 ${rarityTag(
                            selected.item.rarity
                          )}`}
                        >
                          {selected.item.rarity}
                        </span>

                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                          HP {Math.round(selected.hp)}%
                        </span>

                        <span className="text-white/35">•</span>

                        <span className="font-semibold text-white">
                          +{gainFor(selected.item.baseRate, selected.hp).toFixed(2)}/s
                        </span>
                      </div>

                      {selected.pendingEarned > 0 ? (
                        <div className="mt-2 text-xs text-white/60">
                          En attente{" "}
                          <span className="font-semibold text-white">
                            {safeNum(selected.pendingEarned, 0).toFixed(2)} MAC
                          </span>
                        </div>
                      ) : (
                        <div className="mt-2 text-xs text-white/50">En attente 0 MAC</div>
                      )}
                    </div>
                  </div>

                  <div className="mt-5 flex flex-col gap-2">
                    <FormBtn
                      action={selected.equipped ? "/api/items/unequip" : "/api/items/equip"}
                      id={selected.id}
                      label={selected.equipped ? "Déséquiper" : "Équiper"}
                      tone="secondary"
                    />

                    {selected.pendingEarned > 0 ? (
                      <FormBtn
                        action="/api/items/claim"
                        id={selected.id}
                        label={`Claim → Phantom (+${safeNum(selected.pendingEarned, 0).toFixed(2)} MAC)`}
                        tone="primary"
                      />
                    ) : null}

                    <FormBtn
                      action="/api/items/sell"
                      id={selected.id}
                      label={
                        selected.pendingEarned > 0
                          ? `Claim & Vendre (+${(
                              safeNum(selected.pendingEarned, 0) + sellPriceForRarity(selected.item.rarity)
                            ).toFixed(2)} MAC)`
                          : `Vendre (+${sellPriceForRarity(selected.item.rarity)} MAC)`
                      }
                      tone="danger"
                    />

                    <UpgradeButton
                      playerItemId={selected.id}
                      disabled={selected.pendingEarned > 0}
                      label={
                        selected.pendingEarned > 0
                          ? "Upgrade (claim avant)"
                          : `Upgrade (${upgradeCostForRarity(selected.item.rarity)} MAC)`
                      }
                    />

                    <RepairButton playerItemId={selected.id} disabled={selected.hp >= 100} label="Réparer" />
                  </div>
                </>
              )}
            </Card>
          </div>

          {/* RIGHT */}
          <div className="space-y-6">
            <Card title="Équipés" subtitle={`${equipped.length}/${player.slotMax}`}>
              <div className="grid grid-cols-5 gap-3">
                {Array.from({ length: 10 }).map((_, i) => {
                  const pi = equipped[i]
                  const active = pi?.id === selectedId
                  return (
                    <Slot
                      key={i}
                      active={active}
                      onClick={() => pi?.id && setSelectedId(pi.id)}
                      topRight={pi ? <HpPill hp={pi.hp} /> : null}
                    >
                      {pi ? <RuneIcon runeType={pi.item.runeType} rarity={pi.item.rarity} size={68} /> : null}
                    </Slot>
                  )
                })}
              </div>
            </Card>

            <Card
              title="Inventaire"
              subtitle={`${inventory.length}/${MAX_INVENTORY}`}
              right={
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <form action={CLAIM_ALL_INVENTORY_ACTION} method="POST">
                    <button
                      type="submit"
                      disabled={pendingInventoryTotal <= 0}
                      className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/15 disabled:opacity-60"
                    >
                      {pendingInventoryTotal > 0
                        ? `Claim ALL (+${pendingInventoryTotal.toFixed(2)} MAC)`
                        : "Claim ALL"}
                    </button>
                  </form>

                  <form action={SELL_ALL_INVENTORY_ACTION} method="POST">
                    <button
                      type="submit"
                      disabled={inventory.length === 0}
                      className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-500/15 disabled:opacity-60"
                    >
                      {inventory.length > 0 ? `Sell ALL (+${sellAllInventoryTotal.toFixed(2)} MAC)` : "Sell ALL"}
                    </button>
                  </form>
                </div>
              }
            >
              <div className="grid grid-cols-5 gap-3">
                {Array.from({ length: 40 }).map((_, idx) => {
                  const it = inventory[idx]
                  const active = it?.id === selectedId
                  return (
                    <Slot
                      key={idx}
                      active={active}
                      onClick={() => it?.id && setSelectedId(it.id)}
                      topRight={it ? <HpPill hp={it.hp} /> : null}
                    >
                      {it ? <RuneIcon runeType={it.item.runeType} rarity={it.item.rarity} size={68} /> : null}
                    </Slot>
                  )
                })}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </main>
  )
}

function StatTile({
  label,
  value,
  emphasize,
}: {
  label: string
  value: string
  emphasize?: boolean
}) {
  return (
    <div
      className={[
        "rounded-2xl border p-4",
        emphasize ? "border-emerald-500/25 bg-emerald-500/10" : "border-white/10 bg-white/[0.03]",
      ].join(" ")}
    >
      <div className="text-[11px] text-white/55">{label}</div>
      <div className="mt-1 text-base font-semibold text-white">{value}</div>
    </div>
  )
}

function FormBtn({
  action,
  id,
  label,
  tone,
}: {
  action: string
  id: string
  label: string
  tone: "primary" | "secondary" | "danger"
}) {
  const base = "w-full rounded-xl border px-4 py-2 text-sm font-semibold transition"

  const cls =
    tone === "primary"
      ? `${base} border-emerald-500/30 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15`
      : tone === "danger"
      ? `${base} border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/15`
      : `${base} border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.05]`

  return (
    <form action={action} method="POST">
      <input type="hidden" name="playerItemId" value={id} />
      <button type="submit" className={cls}>
        {label}
      </button>
    </form>
  )
}