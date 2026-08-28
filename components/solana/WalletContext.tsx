"use client"

import React, { createContext, useContext, useMemo, useState } from "react"

type WalletContextValue = {
  wallet: string
  setWallet: (wallet: string) => void
  clearWallet: () => void
  isConnected: boolean
}

const WalletContext = createContext<WalletContextValue | null>(null)

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallet, setWalletState] = useState("")

  const value = useMemo<WalletContextValue>(() => {
    return {
      wallet,
      setWallet: (w) => setWalletState(w),
      clearWallet: () => setWalletState(""),
      isConnected: Boolean(wallet),
    }
  }, [wallet])

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet() {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error("useWallet must be used within WalletProvider")
  return ctx
}
