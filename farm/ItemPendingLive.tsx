"use client"

import { useEffect, useMemo, useState } from "react"

function safeNum(x: any, fallback = 0) {
  const n = typeof x === "number" ? x : Number(x)
  return Number.isFinite(n) ? n : fallback
}

function safeDateMs(iso: string) {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : Date.now()
}

type Props = {
  initialPendingEarned: number
  gainPerSecItem: number
  lastClaimedAtIso: string
  equipped: boolean
}

export default function ItemPendingLive({
  initialPendingEarned,
  gainPerSecItem,
  lastClaimedAtIso,
  equipped,
}: Props) {
  const base = useMemo(() => safeNum(initialPendingEarned, 0), [initialPendingEarned])
  const gps = useMemo(() => Math.max(0, safeNum(gainPerSecItem, 0)), [gainPerSecItem])
  const anchorMsFromServer = useMemo(() => safeDateMs(lastClaimedAtIso), [lastClaimedAtIso])

  const [anchorMs, setAnchorMs] = useState(anchorMsFromServer)
  const [basePending, setBasePending] = useState(base)
  const [live, setLive] = useState(base)

  useEffect(() => {
    setAnchorMs(anchorMsFromServer)
    setBasePending(base)
  }, [anchorMsFromServer, base])

  useEffect(() => {
    const handler = (e: any) => {
      const newLast = Date.parse(e?.detail?.lastClaimedAt || "")
      const nextAnchor = Number.isFinite(newLast) ? newLast : Date.now()
      setAnchorMs(nextAnchor)
      setBasePending(0)
    }

    window.addEventListener("mygame:claimed", handler as any)
    return () => window.removeEventListener("mygame:claimed", handler as any)
  }, [])

  useEffect(() => {
    const tick = () => {
      if (!equipped || gps <= 0) {
        setLive(basePending)
        return
      }
      const elapsedSec = Math.max(0, (Date.now() - anchorMs) / 1000)
      const v = basePending + gps * elapsedSec
      setLive(Number.isFinite(v) ? v : basePending)
    }

    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [equipped, gps, anchorMs, basePending])

  return (
    <div className="text-xs text-white/55">
      En attente item : <span className="font-semibold text-white">{live.toFixed(2)}</span>
    </div>
  )
}