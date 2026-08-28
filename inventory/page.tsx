import { auth } from "@/auth"
import { prisma } from "@/src/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"

import FarmCard from "./FarmCard"
import DecayTicker from "./DecayTicker"
import DecayTimer from "./DecayTimer"
import ItemPendingLive from "./ItemPendingLive"
import WalletControls from "@/app/components/WalletControls"
import SwapCard from "./SwapCard"
import TokenBalance from "./TokenBalance"
import RepairButton from "./RepairButton"
import UpgradeButton from "./UpgradeButton"
import ClaimEquippedButton from "./ClaimEquippedButton"

const MAX_INVENTORY = 40
const MAX_LEVEL = 10

const BG_URL = "/img/backgrounds/inventory-bg.png"

const CLAIM_EQUIPPED_ACTION = "/api/items/claim-equipped"
const CLAIM_ALL_INVENTORY_ACTION = "/api/items/claim-all"
const SELL_ALL_INVENTORY_ACTION = "/api/items/sell-all"
const CLAIM_ONE_INVENTORY_ACTION = "/api/items/claim"

function slotsForLevel(level: number) {
  return Math.min(Math.max(level, 1), MAX_LEVEL)
}

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
      return "bg-yellow-100 text-yellow-800 border-yellow-200"
    case "EPIC":
      return "bg-purple-100 text-purple-800 border-purple-200"
    default:
      return "bg-slate-100 text-slate-700 border-slate-200"
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
    default:
      return 5
  }
}

function repairCostForRarity(r: string, hp: number) {
  const missing = Math.max(0, 100 - hp)

  let mult = 1
  switch (r) {
    case "EPIC":
      mult = 4
      break
    case "RARE":
      mult = 2
      break
    default:
      mult = 1
  }

  return Math.ceil(missing * mult)
}

function upgradeCost(currentLevel: number) {
  return Math.round(50 * Math.pow(1.6, currentLevel - 1))
}

function safeNum(x: any, fallback = 0) {
  const n = typeof x === "number" ? x : Number(x)
  return Number.isFinite(n) ? n : fallback
}

export default async function InventoryPage() {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: {
      player: {
        include: {
          items: { include: { item: true }, orderBy: { createdAt: "desc" } },
        },
      },
    },
  })

  if (!user?.player) redirect("/api/me")
  if (!user.player.character) redirect("/choose-character")

  const player = user.player
  const slotMax = slotsForLevel(player.level)

  const equipped = player.items.filter((x: any) => x.equipped)
  const inventory = player.items.filter((x: any) => !x.equipped)

  const gainPerSec = equipped.reduce((sum: number, pi: any) => sum + gainFor(pi.item.baseRate, pi.hp), 0)

  const inventoryFull = inventory.length >= MAX_INVENTORY
  const nextUpgradeCost = player.level >= MAX_LEVEL ? null : upgradeCost(player.level)
  const lastClaimedAtIso = player.lastClaimedAt.toISOString()

  const pendingEquippedTotal = equipped.reduce((sum: number, pi: any) => sum + safeNum(pi.pendingEarned, 0), 0)
  const pendingInventoryTotal = inventory.reduce((sum: number, pi: any) => sum + safeNum(pi.pendingEarned, 0), 0)

  const sellAllInventoryTotal = inventory.reduce((sum: number, pi: any) => {
    const pending = safeNum(pi.pendingEarned, 0)
    const sellPrice = sellPriceForRarity(pi.item.rarity)
    return sum + pending + sellPrice
  }, 0)

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      {/* ================= BACKGROUND (UI) ================= */}
      <div className="absolute inset-0 -z-10">
        {/* fill */}
        <div className="absolute inset-0 bg-black" />

        {/* UI image slightly zoomed so the inner frame contains content */}
        <div
          className="absolute inset-0 bg-center bg-no-repeat"
          style={{
            backgroundImage: `url(${BG_URL})`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center",
            backgroundSize: "min(1800px, 140vw)",
          }}
        />

        {/* readability overlay */}
        <div className="absolute inset-0 bg-black/30" />

        {/* vignette */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.6)_70%,rgba(0,0,0,0.9)_100%)]" />
      </div>

      {/* ================= CONTENT (SAFE AREA) ================= */}
      {/* pt-20 => push down into the inner frame zone */}
      <div className="relative mx-auto max-w-[1320px] px-6 pt-20 pb-10">
        <DecayTicker />

        <header className="mb-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h1 className="text-2xl font-semibold drop-shadow">Wireframe — Inventaire</h1>

            <div className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 shadow-sm backdrop-blur">
              <WalletControls />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Niveau" value={player.level} />
            <Stat label="Slots équipés" value={`${equipped.length}/${slotMax}`} />
            <Stat label="Gain total" value={`${gainPerSec.toFixed(2)}/s`} />
            <Stat
              label="Inventaire"
              value={
                <>
                  {inventory.length}/{MAX_INVENTORY}{" "}
                  {inventoryFull ? <span className="text-sm text-rose-300">plein</span> : null}
                </>
              }
            />
          </div>
        </header>

        <section className="grid grid-cols-1 gap-6 md:grid-cols-12">
          {/* ================= CENTER ================= */}
          <div className="md:col-span-8">
            <div className="rounded-2xl border border-white/10 bg-black/40 p-5 shadow-sm backdrop-blur">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-white/60">Personnage</div>
                  <div className="text-lg font-semibold">
                    {player.character} <span className="text-white/40">(placeholder)</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-white/60">État</div>
                  <div className="text-sm font-medium text-emerald-300">Connecté</div>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-center">
                <div className="flex h-64 w-full items-center justify-center rounded-2xl border-2 border-dashed border-white/20 bg-black/20">
                  <div className="text-center">
                    <div className="text-sm font-medium text-white/85">Zone perso (image 2D plus tard)</div>
                    <div className="mt-1 text-xs text-white/60">Tu affiches le sprite + items équipés</div>
                  </div>
                </div>
              </div>

              {/* ================= EQUIPPED ================= */}
              <div className="mt-6">
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold">Items équipés</h2>
                  <div className="text-xs text-white/60">
                    Slots: {equipped.length}/{slotMax}
                  </div>
                </div>

                {equipped.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/15 bg-black/20 p-4 text-sm text-white/70">
                    Aucun item équipé. Équipe un item depuis la colonne de droite.
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {equipped.map((pi: any) => {
                        const itemGain = gainFor(pi.item.baseRate, pi.hp)

                        return (
                          <div key={pi.id} className="rounded-xl border border-white/10 bg-black/25 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate font-semibold">{pi.item.name}</div>

                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/70">
                                  <span
                                    className={`inline-flex items-center rounded-full border px-2 py-0.5 ${rarityBadge(
                                      pi.item.rarity
                                    )}`}
                                  >
                                    {pi.item.rarity}
                                  </span>

                                  <span>HP {pi.hp}%</span>

                                  <span className="text-white/40">•</span>
                                  <span className="font-medium text-white">+{itemGain.toFixed(2)}/s</span>

                                  <span className="text-white/40">•</span>
                                  <ItemPendingLive
                                    initialPendingEarned={safeNum(pi.pendingEarned, 0)}
                                    gainPerSecItem={itemGain}
                                    lastClaimedAtIso={lastClaimedAtIso}
                                    equipped={true}
                                  />
                                </div>

                                <div className="mt-1">
                                  <DecayTimer
                                    lastItemDecayAtIso={pi.lastItemDecayAt?.toISOString?.() ?? new Date().toISOString()}
                                    hp={pi.hp}
                                    equipped={true}
                                  />
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center justify-end gap-2">
                                <FormBtn action="/api/items/unequip" id={pi.id} label="Déséquiper" />

                                <FormBtn
                                  action="/api/items/sell"
                                  id={pi.id}
                                  label={`Vendre (+${sellPriceForRarity(pi.item.rarity)} MAC)`}
                                  danger
                                  disabled
                                />

                                <FormBtn
                                  action="/api/items/upgrade"
                                  id={pi.id}
                                  label={`Upgrade (${upgradeCostForRarity(pi.item.rarity)} MAC)`}
                                  indigo
                                  disabled
                                />

                                <RepairButton
                                  playerItemId={pi.id}
                                  disabled={pi.hp >= 100}
                                  label={`Réparer (${repairCostForRarity(pi.item.rarity, pi.hp)} MAC)`}
                                />
                              </div>
                            </div>

                            <HpBar hp={pi.hp} />
                          </div>
                        )
                      })}
                    </div>

                    <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-sm text-white/80">
                          En attente (équipés) :{" "}
                          <span className="font-semibold text-white">{pendingEquippedTotal.toFixed(2)}</span> MAC
                        </div>

                        <ClaimEquippedButton
                          action={CLAIM_EQUIPPED_ACTION}
                          initialPending={pendingEquippedTotal}
                          gainPerSec={gainPerSec}
                          lastClaimedAtIso={lastClaimedAtIso}
                        />
                      </div>

                      <div className="mt-2 text-xs text-white/55">
                        Le claim envoie des MAC sur ton wallet Phantom (via la treasury), et reset le pending en DB.
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                <Link
                  href="/chests"
                  className="rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm font-medium text-white/85 hover:bg-black/35"
                >
                  Coffres
                </Link>
              </div>
            </div>
          </div>

          {/* ================= RIGHT ================= */}
          <aside className="md:col-span-4">
            <div className="sticky top-6 space-y-4">
              <FarmCard
                initialPendingBalance={safeNum(player.pendingBalance, 0)}
                gainPerSec={gainPerSec}
                lastClaimedAtIso={lastClaimedAtIso}
                initialLevel={player.level}
                nextUpgradeCost={nextUpgradeCost}
              />

              <div className="rounded-2xl border border-white/10 bg-black/40 p-5 shadow-sm backdrop-blur">
                <div className="text-xs font-semibold">Monnaie : Wallet Phantom (MAC)</div>
                <div className="mt-2">
                  <TokenBalance />
                </div>
                <div className="mt-2 text-xs text-white/60">
                  C’est ce solde qui sert à acheter les coffres, upgrade et réparer.
                </div>
              </div>

              <SwapCard />

              <div className="rounded-2xl border border-white/10 bg-black/40 p-5 shadow-sm backdrop-blur">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold">Inventaire</h2>
                  <div className="text-xs text-white/60">
                    {inventory.length}/{MAX_INVENTORY}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <form action={CLAIM_ALL_INVENTORY_ACTION} method="POST">
                    <button
                      type="submit"
                      disabled={pendingInventoryTotal <= 0}
                      className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {pendingInventoryTotal > 0
                        ? `Claim ALL → Phantom (+${pendingInventoryTotal.toFixed(2)} MAC)`
                        : "Claim ALL"}
                    </button>
                  </form>

                  <form action={SELL_ALL_INVENTORY_ACTION} method="POST">
                    <button
                      type="submit"
                      disabled={inventory.length === 0}
                      className="w-full rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                    >
                      {inventory.length > 0 ? `Vendre ALL (+${sellAllInventoryTotal.toFixed(2)} MAC)` : "Vendre ALL"}
                    </button>
                  </form>
                </div>

                <div className="mt-3 max-h-[60vh] overflow-auto rounded-xl border border-white/10 bg-black/20 p-2">
                  {inventory.length === 0 ? (
                    <div className="p-4 text-sm text-white/70">Inventaire vide.</div>
                  ) : (
                    <ul className="space-y-2">
                      {inventory.map((pi: any) => {
                        const pending = safeNum(pi.pendingEarned, 0)
                        const sellPrice = sellPriceForRarity(pi.item.rarity)
                        const total = pending + sellPrice
                        const disableUpgradeBecausePending = pending > 0

                        return (
                          <li key={pi.id} className="rounded-xl border border-white/10 bg-black/25 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate font-semibold">{pi.item.name}</div>

                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/70">
                                  <span
                                    className={`inline-flex items-center rounded-full border px-2 py-0.5 ${rarityBadge(
                                      pi.item.rarity
                                    )}`}
                                  >
                                    {pi.item.rarity}
                                  </span>

                                  <span>HP {pi.hp}%</span>

                                  <span className="text-white/40">•</span>
                                  <span className="font-medium text-white">
                                    +{gainFor(pi.item.baseRate, pi.hp).toFixed(2)}/s
                                  </span>

                                  {pending > 0 ? (
                                    <>
                                      <span className="text-white/40">•</span>
                                      <span className="font-medium text-white">En attente {pending.toFixed(2)} MAC</span>
                                    </>
                                  ) : null}
                                </div>
                              </div>

                              <div className="flex flex-col items-stretch gap-2">
                                <FormBtn action="/api/items/equip" id={pi.id} label="Équiper" solid />

                                {pending > 0 ? (
                                  <FormBtn
                                    action={CLAIM_ONE_INVENTORY_ACTION}
                                    id={pi.id}
                                    label={`Claim → Phantom (+${pending.toFixed(2)} MAC)`}
                                    emerald
                                  />
                                ) : null}

                                <FormBtn
                                  action="/api/items/sell"
                                  id={pi.id}
                                  label={
                                    pending > 0
                                      ? `Claim & Vendre (+${total.toFixed(2)} MAC)`
                                      : `Vendre (+${sellPrice} MAC)`
                                  }
                                  danger
                                />

                                <UpgradeButton
                                  playerItemId={pi.id}
                                  disabled={disableUpgradeBecausePending}
                                  label={
                                    disableUpgradeBecausePending
                                      ? "Upgrade (claim avant)"
                                      : `Upgrade (${upgradeCostForRarity(pi.item.rarity)} MAC)`
                                  }
                                />

                                <RepairButton
                                  playerItemId={pi.id}
                                  disabled={pi.hp >= 100}
                                  label={`Réparer (${repairCostForRarity(pi.item.rarity, pi.hp)} MAC)`}
                                />
                              </div>
                            </div>

                            <HpBar hp={pi.hp} />
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>

                {inventoryFull ? (
                  <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
                    Inventaire plein : vends / upgrade / ouvre moins de coffres.
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3 text-xs text-white/60">
                    Prochaines étapes : dégradation → réparation → coffres.
                  </div>
                )}
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  )
}

/* -------- UI Helpers -------- */

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-4 shadow-sm backdrop-blur">
      <div className="text-xs text-white/60">{label}</div>
      <div className="mt-1 text-xl font-semibold text-white">{value}</div>
    </div>
  )
}

function HpBar({ hp }: { hp: number }) {
  const safeHp = Math.max(0, Math.min(100, Number(hp) || 0))
  return (
    <div className="mt-3 h-2 w-full rounded-full bg-white/10">
      <div className="h-2 rounded-full bg-white/90" style={{ width: `${safeHp}%` }} />
    </div>
  )
}

function FormBtn({
  action,
  id,
  label,
  danger,
  indigo,
  emerald,
  solid,
  full,
  disabled,
}: {
  action: string
  id: string
  label: string
  danger?: boolean
  indigo?: boolean
  emerald?: boolean
  solid?: boolean
  full?: boolean
  disabled?: boolean
}) {
  const base =
    "rounded-lg border px-3 py-2 text-sm font-medium hover:bg-white/10 disabled:opacity-60 disabled:hover:bg-transparent"
  let cls = base + " border-white/10 text-white/85 bg-black/25"

  if (danger) cls = base + " border-rose-500/30 text-rose-200 bg-rose-500/10 hover:bg-rose-500/15"
  if (indigo) cls = base + " border-indigo-500/30 text-indigo-200 bg-indigo-500/10 hover:bg-indigo-500/15"
  if (emerald) cls = base + " border-emerald-500/30 text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/15"
  if (solid) cls = "w-full rounded-lg bg-white/90 px-3 py-2 text-sm font-semibold text-black hover:bg-white"

  if (full && !solid) cls += " w-full"

  return (
    <form action={action} method="POST" className={full ? "w-full" : "inline"}>
      <input type="hidden" name="playerItemId" value={id} />
      <button type="submit" className={cls} disabled={disabled}>
        {label}
      </button>
    </form>
  )
}
