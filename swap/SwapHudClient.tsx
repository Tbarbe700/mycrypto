"use client"

import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import WalletControls from "@/app/components/WalletControls"
import SwapExchangeCard from "./SwapExchangeCard"

function normalizePath(pathname: string) {
  const p = pathname.split("?")[0].split("#")[0]
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p
}

export default function SwapHudClient() {
  const pathnameRaw = usePathname()
  const pathname = normalizePath(pathnameRaw || "")

  const menu = [
    { label: "Farm", href: "/farm" },
    { label: "Inventory", href: "/inventory-v2" },
    { label: "Swap", href: "/swap" },
    { label: "Chests", href: "/chests" },
    { label: "Referral", href: "/referral" },
  ] as const

  return (
    <main className="min-h-screen bg-black text-white">
      {/* background premium (indépendant de inventory-v2) */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-black" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(59,130,246,0.18),transparent_40%),radial-gradient(circle_at_80%_60%,rgba(34,197,94,0.14),transparent_42%),radial-gradient(circle_at_50%_110%,rgba(168,85,247,0.10),transparent_45%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.06),transparent_35%,rgba(0,0,0,0.6))]" />
      </div>

      <div className="mx-auto w-full max-w-[1180px] px-6 py-8">
        {/* TOP BAR */}
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-4 backdrop-blur">
            <div className="grid grid-cols-5 place-items-center gap-3">
              {menu.map((t) => {
                const active = pathname === t.href
                return (
                  <Link
                    key={t.label}
                    href={t.href}
                    className={[
                      "relative select-none rounded-lg px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.18em] transition",
                      active ? "text-white" : "text-white/60 hover:text-white",
                    ].join(" ")}
                  >
                    {t.label}
                    {active ? (
                      <span className="pointer-events-none absolute left-1/2 top-[calc(100%+2px)] h-[2px] w-10 -translate-x-1/2 bg-emerald-400/80 blur-[0.8px]" />
                    ) : null}
                  </Link>
                )
              })}
            </div>
          </div>

          <div className="self-end lg:self-auto">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 backdrop-blur">
              <WalletControls />
            </div>
          </div>
        </div>

        {/* CONTENT */}
        <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
          {/* Left: Exchange */}
          <div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.55)] backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/60">
                    Exchange
                  </div>
                  <div className="mt-2 text-2xl font-semibold">Swap SOL → MAC</div>
                  <div className="mt-1 text-sm text-white/60">
                    Interface premium : preview, slippage, status & historique.
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
                  <div className="text-[11px] text-white/60">Mode</div>
                  <div className="text-sm font-semibold">Instant</div>
                </div>
              </div>

              <div className="mt-6">
                <SwapExchangeCard />
              </div>
            </div>
          </div>

          {/* Right: Info / status */}
          <aside className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
              <div className="text-sm font-semibold">Infos</div>
              <ul className="mt-3 space-y-2 text-sm text-white/70">
                <li>• Tu envoies des SOL vers la treasury</li>
                <li>• L’API valide la transaction</li>
                <li>• Tu reçois des tokens sur ton wallet</li>
                <li>• Slippage = protection (min received)</li>
              </ul>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
              <div className="text-sm font-semibold">Bonnes pratiques</div>
              <div className="mt-3 text-sm text-white/70 leading-relaxed">
                Commence avec de petits montants (ex: 0.05 SOL), et garde une marge
                pour les fees réseau.
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
