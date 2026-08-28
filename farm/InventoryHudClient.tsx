"use client"

import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import WalletControls from "@/app/components/WalletControls"
import RuneIcon from "@/app/components/RuneIcon"
import PlayerUpgradeButton from "./PlayerUpgradeButton"

import RepairButton from "./RepairButton"
import UpgradeButton from "./UpgradeButton"

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
const CLAIM_EQUIPPED_ACTION = "/api/items/claim-equipped"

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x))
}

function gainFor(baseRate: number, hp: number) {
  const br = Number(baseRate) || 0
  const h = Number(hp) || 0
  return br * clamp01(h / 100)
}

function rarityBadge(r: string) {
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

function normalizePath(pathname: string) {
  const p = pathname.split("?")[0].split("#")[0]
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p
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
      {(title || subtitle || right) && (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {title ? <div className="text-sm font-semibold text-white/95">{title}</div> : null}
            {subtitle ? <div className="mt-1 text-xs text-white/55">{subtitle}</div> : null}
          </div>
          {right ? <div className="shrink-0">{right}</div> : null}
        </div>
      )}
      {children}
    </div>
  )
}

function Slot({
  active,
  onClick,
  children,
}: {
  active?: boolean
  onClick?: () => void
  children?: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "relative aspect-[3/2] w-full rounded-2xl border p-2 transition",
        "bg-white/[0.03] hover:bg-white/[0.05]",
        active ? "border-emerald-400/50 ring-1 ring-emerald-400/25" : "border-white/10",
      ].join(" ")}
    >
      <div className="absolute inset-0 rounded-2xl shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]" />
      <div className="flex h-full w-full items-center justify-center">{children}</div>
    </button>
  )
}

function FormBtn({
  action,
  id,
  label,
  danger,
}: {
  action: string
  id: string
  label: string
  danger?: boolean
}) {
  const base = "w-full rounded-xl border px-4 py-2 text-sm font-semibold transition"
  const cls = danger
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

function NavBtn({
  href,
  label,
  tone,
}: {
  href: string
  label: string
  tone: "primary" | "secondary"
}) {
  const base = "w-full rounded-xl border px-4 py-2 text-sm font-semibold transition text-center"
  const cls =
    tone === "primary"
      ? `${base} border-emerald-500/30 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15`
      : `${base} border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.05]`

  return (
    <Link href={href} className={cls}>
      {label}
    </Link>
  )
}

export default function InventoryHudClient({ player, gainPerSec, nextUpgradeCost, equipped, inventory }: Props) {
  const pathnameRaw = usePathname()
  const pathname = normalizePath(pathnameRaw || "")

  const menu = [
    { label: "FARM", href: "/farm" },
    { label: "INVENTORY", href: "/inventory-v2" },
    { label: "SWAP", href: "/swap" },
    { label: "CHESTS", href: "/chests" },
    { label: "REFERRAL", href: "/referral" },
  ] as const

  const initialSelected = equipped[0]?.id ?? inventory[0]?.id ?? null
  const [selectedId, setSelectedId] = React.useState<string | null>(initialSelected)

  React.useEffect(() => {
    if (!selectedId) return
    const exists = equipped.some((x) => x.id === selectedId) || inventory.some((x) => x.id === selectedId)
    if (!exists) setSelectedId(equipped[0]?.id ?? inventory[0]?.id ?? null)
  }, [equipped, inventory, selectedId])

  const selected =
    equipped.find((x) => x.id === selectedId) ?? inventory.find((x) => x.id === selectedId) ?? null

  const EQUIPPED_ICON = 60
  const SELECT_ICON = 90

  return (
    <main className="min-h-screen bg-[#07090A] text-white">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(16,185,129,0.18),transparent_45%),radial-gradient(circle_at_85%_25%,rgba(255,255,255,0.06),transparent_40%)]" />
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

        {/* GRID */}
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          {/* LEFT */}
          <div className="space-y-6">
            {/* PERSONNAGE : uniquement la zone visuelle */}
            <Card title="Personnage" subtitle="Zone visuelle personnage">
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <div className="h-[220px] rounded-xl border border-white/10 bg-black/25" />
              </div>
            </Card>

            {/* RUNES ÉQUIPÉES */}
            <Card
              title="Runes équipées"
              subtitle={`${player.character} • Niveau ${player.level} • Slots ${equipped.length}/${player.slotMax} • Inventaire ${inventory.length}/${MAX_INVENTORY}`}
              right={
                <div className="text-right">
                  <div className="text-xs text-white/55">Gain total</div>
                  <div className="mt-1 text-lg font-semibold text-white">{gainPerSec.toFixed(2)}/s</div>
                </div>
              }
            >
              <div className="grid grid-cols-5 gap-3">
                {Array.from({ length: 10 }).map((_, i) => {
                  const pi = equipped[i]
                  const active = pi?.id === selectedId
                  return (
                    <Slot key={i} active={active} onClick={() => pi?.id && setSelectedId(pi.id)}>
                      {pi ? <RuneIcon runeType={pi.item.runeType} rarity={pi.item.rarity} size={EQUIPPED_ICON} /> : null}
                    </Slot>
                  )
                })}
              </div>
            </Card>

            {/* ✅ À la place de la grille inventaire : 2 boutons */}
            <Card title="Navigation" subtitle="Accès rapide">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <NavBtn href="/inventory-v2" label="Voir l’inventaire" tone="secondary" />
                <NavBtn href="/chests" label="Ouvrir coffre" tone="primary" />
              </div>
            </Card>
          </div>

          {/* RIGHT */}
          <div className="space-y-6">
            {/* Sélection en haut */}
            <Card title="Sélection" subtitle={selected ? "Détails & actions" : "Sélectionne une rune"}>
              {!selected ? (
                <div className="text-white/60">Clique sur une rune à gauche.</div>
              ) : (
                <>
                  <div className="flex items-center gap-4">
                    <RuneIcon runeType={selected.item.runeType} rarity={selected.item.rarity} size={SELECT_ICON} />
                    <div className="min-w-0">
                      <div className="truncate text-lg font-semibold text-white">{selected.item.name}</div>

                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/65">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 ${rarityBadge(
                            selected.item.rarity
                          )}`}
                        >
                          {selected.item.rarity}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                          HP {selected.hp}%
                        </span>
                        <span className="text-white/35">•</span>
                        <span className="font-semibold text-white">
                          +{gainFor(selected.item.baseRate, selected.hp).toFixed(2)}/s
                        </span>
                      </div>

                      {selected.pendingEarned > 0 ? (
                        <div className="mt-2 text-xs text-white/60">
                          En attente{" "}
                          <span className="font-semibold text-white">{selected.pendingEarned.toFixed(2)} MAC</span>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-5 flex flex-col gap-2">
                    <FormBtn
                      action={selected.equipped ? "/api/items/unequip" : "/api/items/equip"}
                      id={selected.id}
                      label={selected.equipped ? "Déséquiper" : "Équiper"}
                    />

                    <FormBtn
                      action="/api/items/sell"
                      id={selected.id}
                      label={`Vendre (+${sellPriceForRarity(selected.item.rarity)} MAC)`}
                      danger
                    />

                    <UpgradeButton
                      playerItemId={selected.id}
                      disabled={false}
                      label={`Upgrade (${upgradeCostForRarity(selected.item.rarity)} MAC)`}
                    />

                    <RepairButton
                      playerItemId={selected.id}
                      disabled={selected.hp >= 100}
                      label={selected.hp >= 100 ? "Réparer (HP max)" : "Réparer"}
                    />
                  </div>
                </>
              )}
            </Card>

            {/* Farm en bas (sans doublon) */}
            <Card title="Farm" subtitle="Niveau + Upgrade + Claim (équipés)">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm text-white/85">
                    Niveau : <b className="text-white">{player.level}</b>
                  </div>
                  <div className="mt-1 text-xs text-white/55">
                    Coût : {nextUpgradeCost == null ? "MAX" : `${nextUpgradeCost} MAC`}
                  </div>
                </div>

                {/* ✅ un seul endroit pour upgrade */}
                <PlayerUpgradeButton disabled={nextUpgradeCost == null} />
              </div>

              {/* ✅ montant au dessus + bouton claim */}
              <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-xs text-white/55">Montant à claim (runes équipées)</div>
                <div className="mt-1 text-2xl font-semibold text-white">{player.pendingBalance.toFixed(2)} MAC</div>

                <div className="mt-3">
                  <form action={CLAIM_EQUIPPED_ACTION} method="POST">
                    <button
                      type="submit"
                      disabled={player.pendingBalance <= 0}
                      className="w-full rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/15 disabled:opacity-60"
                    >
                      Claim équipés
                    </button>
                  </form>

                  <div className="mt-2 text-[11px] text-white/45">
                    Le claim récupère le pending global lié aux runes équipées.
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </main>
  )
}