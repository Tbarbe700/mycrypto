"use client"

import { useMemo, useRef, useState } from "react"
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js"
import { solanaConnection } from "@/src/lib/solana/connection"
import {
  CHARACTER_PRICE_LAMPORTS,
  CHARACTER_PRICE_SOL,
  RECEIVER_WALLET,
} from "@/src/lib/solana/constants"

function short(pk: string) {
  return `${pk.slice(0, 4)}...${pk.slice(-4)}`
}

type PhantomProvider = {
  isPhantom?: boolean
  publicKey?: { toBase58: () => string }
  connect: (...args: any[]) => Promise<any>
  disconnect?: () => Promise<void> | void
  signAndSendTransaction: (tx: Transaction) => Promise<{ signature: string }>
}

export default function ChooseCharacterClient({
  initialUnlocked,
}: {
  initialUnlocked: boolean
}) {
  const [wallet, setWallet] = useState<string>("")
  const [unlocked, setUnlocked] = useState<boolean>(initialUnlocked)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ✅ Debug visible à l’écran
  const [debug, setDebug] = useState<any>(null)

  // ✅ garder le même provider pour connect + pay
  const providerRef = useRef<PhantomProvider | null>(null)

  const getProvider = useMemo(() => {
    return () =>
      ((window as any).phantom?.solana ?? (window as any).solana) as
        | PhantomProvider
        | undefined
  }, [])

  const connect = async () => {
    setError(null)
    setDebug(null)

    const provider = getProvider()

    setDebug({
      hasProvider: !!provider,
      isPhantom: !!provider?.isPhantom,
      hasConnect: typeof provider?.connect === "function",
      beforePublicKey: provider?.publicKey?.toBase58?.() ?? null,
      origin: typeof window !== "undefined" ? window.location.origin : null,
    })

    try {
      if (!provider?.isPhantom) {
        setError("Phantom n’est pas détecté.")
        return
      }

      providerRef.current = provider

      // ✅ reset l’état Phantom (corrige souvent le -32603)
      try {
        await provider.disconnect?.()
      } catch {}

      // ✅ compat max: pas d'options
      const resp = await provider.connect()

      const pk =
        resp?.publicKey?.toBase58?.() ??
        provider?.publicKey?.toBase58?.() ??
        null

      setDebug((d: any) => ({
        ...d,
        respType: typeof resp,
        respKeys: resp ? Object.keys(resp) : null,
        afterPublicKey: pk,
      }))

      if (!pk) {
        setError("Connect OK, mais publicKey introuvable (resp/provider).")
        return
      }

      setWallet(pk)
    } catch (e: any) {
      setDebug((d: any) => ({
        ...d,
        caughtMessage: e?.message ?? null,
        caughtName: e?.name ?? null,
        caughtCode: e?.code ?? null,
        caughtStack: e?.stack ?? null,
        caughtKeys: e ? Object.keys(e) : null,
        caughtRaw: String(e),
      }))
      setError(e?.message ?? "Connexion refusée.")
    }
  }

  const pay = async () => {
    setError(null)

    const provider = providerRef.current
    if (!provider) return setError("Connecte Phantom d’abord.")
    if (!wallet) return setError("Wallet manquant.")
    if (!RECEIVER_WALLET) return setError("Receiver wallet manquant (.env).")

    try {
      setLoading(true)

      const fromPubkey = new PublicKey(wallet)
      const toPubkey = new PublicKey(RECEIVER_WALLET)

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey,
          toPubkey,
          lamports: CHARACTER_PRICE_LAMPORTS,
        })
      )

      tx.feePayer = fromPubkey
      const { blockhash } = await solanaConnection.getLatestBlockhash("confirmed")
      tx.recentBlockhash = blockhash

      // ✅ signer/envoyer avec le même provider que connect()
      const { signature } = await provider.signAndSendTransaction(tx)

      await solanaConnection.confirmTransaction(signature, "confirmed")

      const r = await fetch("/api/solana/verify-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature, walletAddress: wallet }),
      })

      const data = await r.json()
      if (!r.ok || !data?.ok) {
        setError(data?.error ?? "Vérification paiement échouée.")
        return
      }

      setUnlocked(true)
    } catch (e: any) {
      setError(e?.message ?? "Paiement annulé/échoué.")
    } finally {
      setLoading(false)
    }
  }

  const disconnect = async () => {
  try {
    await providerRef.current?.disconnect?.()
  } catch {
    // Phantom peut throw, on ignore
  } finally {
    providerRef.current = null
    setWallet("")
    setError(null)
    setDebug(null)
  }
}

  return (
    <div style={{ marginTop: 16 }}>
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {!wallet ? (
  <button onClick={connect}>Connecter Phantom</button>
) : (
  <>
    <div>
      Wallet connecté: <b>{short(wallet)}</b>
    </div>
    <button
      onClick={disconnect}
      style={{
        padding: "6px 10px",
        border: "1px solid #ccc",
        borderRadius: 6,
        background: "#f5f5f5",
        cursor: "pointer",
      }}
    >
      Se déconnecter
    </button>
  </>
)}

        {!unlocked ? (
          <button onClick={pay} disabled={!wallet || loading}>
            {loading ? "Paiement..." : `Payer ${CHARACTER_PRICE_SOL} SOL (Devnet)`}
          </button>
        ) : (
          <div
            style={{
              padding: "6px 10px",
              border: "1px solid #ddd",
              borderRadius: 8,
            }}
          >
            ✅ Débloqué
          </div>
        )}
      </div>

      {error && <p style={{ color: "crimson", marginTop: 8 }}>{error}</p>}

      {debug && (
        <pre
          style={{
            marginTop: 12,
            padding: 12,
            background: "#f6f6f6",
            fontSize: 12,
            overflowX: "auto",
          }}
        >
          {JSON.stringify(debug, null, 2)}
        </pre>
      )}

      <div
        style={{
          marginTop: 20,
          opacity: unlocked ? 1 : 0.5,
          pointerEvents: unlocked ? "auto" : "none",
        }}
      >
        <h2>Choisis ton personnage</h2>
        <p>Tu ne peux choisir qu’une seule fois (pour l’instant).</p>

        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          <form action="/choose-character/select" method="POST">
            <input type="hidden" name="character" value="perso1" />
            <button type="submit">Perso 1</button>
          </form>

          <form action="/choose-character/select" method="POST">
            <input type="hidden" name="character" value="perso2" />
            <button type="submit">Perso 2</button>
          </form>

          <form action="/choose-character/select" method="POST">
            <input type="hidden" name="character" value="perso3" />
            <button type="submit">Perso 3</button>
          </form>
        </div>

        {!unlocked && (
          <p style={{ marginTop: 12, color: "#666" }}>
            🔒 Paiement requis avant de choisir.
          </p>
        )}
      </div>
    </div>
  )
}
