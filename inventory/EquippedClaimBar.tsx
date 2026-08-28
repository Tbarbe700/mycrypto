"use client"

import { useEffect, useRef, useState } from "react"

function safeNum(x: any, fallback = 0) {
  const n = typeof x === "number" ? x : Number(x)
  return Number.isFinite(n) ? n : fallback
}

function safeDateMs(iso: string) {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : Date.now()
}

async function readJsonSafe(res: Response) {
  const text = await res.text()
  if (!text) return { data: null as any, text: "" }
  try {
    return { data: JSON.parse(text), text }
  } catch {
    return { data: null as any, text }
  }
}

type ItemRow = {
  id: string
  initialPendingEarned: number
  gainPerSecItem: number
}

type Props = {
  claimAction: string
  lastClaimedAtIso: string
  items: ItemRow[]
}

export default function EquippedClaimBar({ claimAction, lastClaimedAtIso, items }: Props) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [total, setTotal] = useState(0)

  const anchorMsRef = useRef<number>(safeDateMs(lastClaimedAtIso))
  const baseMapRef = useRef<Map<string, number>>(new Map())

  // init
  useEffect(() => {
    const m = new Map<string, number>()
    for (const it of items) m.set(it.id, Math.max(0, safeNum(it.initialPendingEarned, 0)))
    baseMapRef.current = m
    anchorMsRef.current = safeDateMs(lastClaimedAtIso)
  }, [items, lastClaimedAtIso])

  // live total
  useEffect(() => {
    const tick = () => {
      const elapsedSec = Math.max(0, (Date.now() - anchorMsRef.current) / 1000)
      let sum = 0
      for (const it of items) {
        const base = baseMapRef.current.get(it.id) ?? 0
        const gps = Math.max(0, safeNum(it.gainPerSecItem, 0))
        sum += base + gps * elapsedSec
      }
      setTotal(Number.isFinite(sum) ? sum : 0)
    }

    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [items])

  // reset si claim ailleurs
  useEffect(() => {
    const handler = (e: any) => {
      const nextIso = e?.detail?.lastClaimedAt as string | undefined
      anchorMsRef.current = nextIso ? safeDateMs(nextIso) : Date.now()

      const m = new Map(baseMapRef.current)
      for (const it of items) m.set(it.id, 0)
      baseMapRef.current = m
      setTotal(0)
    }

    window.addEventListener("mygame:claimed", handler as any)
    return () => window.removeEventListener("mygame:claimed", handler as any)
  }, [items])

  async function claimEquipped() {
    setBusy(true)
    setErr(null)

    try {
      const res = await fetch(claimAction, { method: "POST" })
      const { data, text } = await readJsonSafe(res)

      if (!res.ok) {
        const msg =
          (data && typeof data === "object" && "error" in data && (data as any).error) ||
          `Claim failed (${res.status})`
        throw new Error(String(msg))
      }

      const newBalance = safeNum((data as any).balance, NaN)
      const nextLast = (data as any).lastClaimedAt || new Date().toISOString()

      anchorMsRef.current = safeDateMs(nextLast)
      const m = new Map(baseMapRef.current)
      for (const it of items) m.set(it.id, 0)
      baseMapRef.current = m
      setTotal(0)

      window.dispatchEvent(
        new CustomEvent("mygame:claimed", {
          detail: {
            lastClaimedAt: nextLast,
            balance: Number.isFinite(newBalance) ? newBalance : undefined,
            scope: "equipped",
          },
        })
      )
    } catch (e: any) {
      setErr(e?.message || "Erreur inconnue")
    } finally {
      setBusy(false)
    }
  }

  const disabled = busy || total <= 0

  return (
    <div className="mt-4 rounded-xl border bg-slate-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-700">
          En attente (équipés) : <span className="font-semibold text-slate-900">{total.toFixed(2)}</span>
        </div>

        <button
          type="button"
          onClick={claimEquipped}
          disabled={disabled}
          className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 sm:w-auto"
        >
          {busy ? "..." : total > 0 ? `Claim (équipés) (+${total.toFixed(2)}$)` : "Claim (équipés)"}
        </button>
      </div>

      <div className="mt-2 text-xs text-slate-500">
        Ce bouton claim uniquement les items équipés (pas l’inventaire).
      </div>

      {err ? (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <b>Erreur :</b> {err}
        </div>
      ) : null}
    </div>
  )
}
