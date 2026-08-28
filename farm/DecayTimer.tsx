"use client"

import { useEffect, useMemo, useState } from "react"

const DECAY_INTERVAL_SEC = 60 // ⚠️ doit matcher le backend

function safeDateMs(iso: string) {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : Date.now()
}

function fmtMMSS(totalSec: number) {
  const s = Math.max(0, Math.floor(totalSec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`
}

type Props = {
  lastItemDecayAtIso: string
  hp: number
  equipped: boolean
}

export default function DecayTimer({ lastItemDecayAtIso, hp, equipped }: Props) {
  // ❌ Item cassé ou pas équipé → timer bloqué
  if (!equipped || hp <= 0) {
    return (
      <div className="text-xs text-slate-400">
        Prochaine dégradation : <span className="font-medium">00:00</span>
      </div>
    )
  }

  const lastMs = useMemo(
    () => safeDateMs(lastItemDecayAtIso),
    [lastItemDecayAtIso]
  )

  const [remainingSec, setRemainingSec] = useState(DECAY_INTERVAL_SEC)

  useEffect(() => {
    const update = () => {
      const next = lastMs + DECAY_INTERVAL_SEC * 1000
      const diff = Math.max(0, Math.floor((next - Date.now()) / 1000))
      setRemainingSec(diff)
    }

    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [lastMs])

  return (
    <div className="text-xs text-slate-500">
      Prochaine dégradation dans{" "}
      <span className="font-medium text-slate-700">
        {fmtMMSS(remainingSec)}
      </span>
    </div>
  )
}
