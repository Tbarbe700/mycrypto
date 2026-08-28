"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

export default function DecayTicker() {
  const router = useRouter()
  const runningRef = useRef(false)

  useEffect(() => {
    let alive = true

    const tick = async () => {
      if (!alive) return
      if (runningRef.current) return // évite double call si lag
      runningRef.current = true

      try {
        await fetch("/api/decay", {
          method: "POST",
          cache: "no-store",
        })

        // refresh server components (HP, gain/sec, etc.)
        if (alive) router.refresh()
      } catch {
        // silencieux (dev local => pas besoin de spam console)
      } finally {
        runningRef.current = false
      }
    }

    // tick immédiat
    tick()

    // en dev : 10s (tu vois les HP bouger vite)
    const id = setInterval(tick, 10_000)

    return () => {
      alive = false
      clearInterval(id)
    }
  }, [router])

  return null
}
