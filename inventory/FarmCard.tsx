// app/inventory/FarmCard.tsx
"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import PlayerUpgradeButton from "./PlayerUpgradeButton"

type Props = {
  initialPendingBalance: number
  gainPerSec: number
  lastClaimedAtIso: string
  initialLevel: number
  nextUpgradeCost: number | null
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x))
}

function safeNum(x: any, fallback = 0) {
  const n = typeof x === "number" ? x : Number(x)
  return Number.isFinite(n) ? n : fallback
}

function safeDateMs(iso: string) {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : Date.now()
}

export default function FarmCard({
  initialPendingBalance,
  gainPerSec,
  lastClaimedAtIso,
  initialLevel,
  nextUpgradeCost,
}: Props) {
  const safeInitialPending = Math.max(0, safeNum(initialPendingBalance, 0))
  const safeGainPerSec = Math.max(0, safeNum(gainPerSec, 0))

  const [pending, setPending] = useState<number>(safeInitialPending)
  const [error, setError] = useState<string | null>(null)

  // anchor server (utile au 1er rendu / reload)
  const anchorMsFromServer = useMemo(() => safeDateMs(lastClaimedAtIso), [lastClaimedAtIso])

  // refs = évite les effets “ça baisse quand gainPerSec change”
  const anchorMsRef = useRef<number>(anchorMsFromServer)
  const basePendingRef = useRef<number>(safeInitialPending)

  // ✅ resync uniquement quand le serveur change vraiment (reload / navigation)
  useEffect(() => {
    setError(null)
    anchorMsRef.current = anchorMsFromServer
    basePendingRef.current = safeInitialPending
    setPending(safeInitialPending)
  }, [anchorMsFromServer, safeInitialPending])

  // ✅ tick fluide
  useEffect(() => {
    const tick = () => {
      const elapsedSec = Math.max(0, (Date.now() - anchorMsRef.current) / 1000)
      const next = basePendingRef.current + safeGainPerSec * elapsedSec
      setPending(Number.isFinite(next) ? next : basePendingRef.current)
    }

    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [safeGainPerSec])

  // ✅ si un claim se fait ailleurs (claim équipés, claim-all inventaire, etc.)
  // on reset instant FarmCard aussi.
  useEffect(() => {
    const handler = (e: any) => {
      try {
        const nextIso = e?.detail?.lastClaimedAt as string | undefined
        const nextAnchor = nextIso ? safeDateMs(nextIso) : Date.now()

        basePendingRef.current = 0
        anchorMsRef.current = nextAnchor
        setPending(0)
      } catch (err) {
        console.error("FarmCard claimed event error:", err)
      }
    }

    window.addEventListener("mygame:claimed", handler as any)
    return () => window.removeEventListener("mygame:claimed", handler as any)
  }, [])

  return (
    <div className="rounded-2xl border border-white/10 bg-black/35 p-5 shadow-sm backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">Farm</div>
          <div className="text-xs text-white/60">
            En attente (équipés) en temps réel — claim via “Claim équipés”
          </div>
        </div>
      </div>

      {/* Niveau + Upgrade personnage (MAC/Phantom) */}
      <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-white/85">
            Niveau : <b className="text-white">{initialLevel}</b>
            <div className="mt-0.5 text-xs text-white/60">
              {nextUpgradeCost == null ? "Niveau max" : `Coût: ${nextUpgradeCost} MAC`}
            </div>
          </div>

          <PlayerUpgradeButton disabled={nextUpgradeCost == null} />
        </div>
      </div>

      {/* Gain/sec */}
      <div className="mt-4">
        <div className="rounded-xl border border-white/10 bg-black/25 p-4">
          <div className="text-xs text-white/60">Gain/sec</div>
          <div className="mt-1 text-lg font-semibold text-white">{safeGainPerSec.toFixed(2)}</div>
        </div>
      </div>

      {/* Pending */}
      <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-4">
        <div className="text-xs text-white/60">En attente (items équipés)</div>
        <div className="mt-1 text-2xl font-semibold text-white">{pending.toFixed(2)}</div>

        <div className="mt-3 h-2 w-full rounded-full bg-white/10">
          <div
            className="h-2 rounded-full bg-emerald-500"
            style={{ width: `${clamp01(pending / 100) * 100}%` }}
          />
        </div>
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          <b>Erreur :</b> {error}
        </div>
      ) : null}
    </div>
  )
}
