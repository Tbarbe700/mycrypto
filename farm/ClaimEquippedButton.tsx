"use client"

import { useEffect, useMemo, useRef, useState } from "react"

type Props = {
  action: string
  initialPending: number
  gainPerSec: number
  lastClaimedAtIso: string
}

function safeNum(x: any, fallback = 0) {
  const n = typeof x === "number" ? x : Number(x)
  return Number.isFinite(n) ? n : fallback
}

function safeDateMs(iso: string) {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : Date.now()
}

export default function ClaimEquippedButton({
  action,
  initialPending,
  gainPerSec,
  lastClaimedAtIso,
}: Props) {
  const safeInitialPending = Math.max(0, safeNum(initialPending, 0))
  const safeGainPerSec = Math.max(0, safeNum(gainPerSec, 0))

  const [pending, setPending] = useState<number>(safeInitialPending)
  const [submitting, setSubmitting] = useState(false)

  const anchorMsFromServer = useMemo(() => safeDateMs(lastClaimedAtIso), [lastClaimedAtIso])
  const anchorMsRef = useRef<number>(anchorMsFromServer)
  const basePendingRef = useRef<number>(safeInitialPending)

  // resync si reload serveur
  useEffect(() => {
    anchorMsRef.current = anchorMsFromServer
    basePendingRef.current = safeInitialPending
    setPending(safeInitialPending)
  }, [anchorMsFromServer, safeInitialPending])

  // tick live
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

  // écoute les claims pour reset instant (même event que FarmCard)
  useEffect(() => {
    const handler = (e: any) => {
      const nextIso = e?.detail?.lastClaimedAt as string | undefined
      const nextAnchor = nextIso ? safeDateMs(nextIso) : Date.now()
      basePendingRef.current = 0
      anchorMsRef.current = nextAnchor
      setPending(0)
    }
    window.addEventListener("mygame:claimed", handler as any)
    return () => window.removeEventListener("mygame:claimed", handler as any)
  }, [])

  const disabled = submitting || pending <= 0

  return (
    <form
      action={action}
      method="POST"
      className="sm:w-auto"
      onSubmit={() => setSubmitting(true)}
    >
      <button
        type="submit"
        disabled={disabled}
        className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 sm:w-auto"
      >
        {pending > 0 ? `Claim (équipés) → Phantom (+${pending.toFixed(2)} MAC)` : "Claim (équipés)"}
      </button>
    </form>
  )
}
