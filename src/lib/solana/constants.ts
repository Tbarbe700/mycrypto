// src/lib/solana/constants.ts

export const SOLANA_RPC_PUBLIC =
  process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.devnet.solana.com"

// RPC côté serveur (peut être privé). Fallback sur le public si absent.
export const SOLANA_RPC_SERVER =
  process.env.SOLANA_RPC ?? process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.devnet.solana.com"

// Mint du token MAC : on accepte les 2 noms pour éviter les mismatches.
export const TOKEN_MINT =
  process.env.SOLANA_TOKEN_MINT ??
  process.env.NEXT_PUBLIC_TOKEN_MINT ??
  process.env.NEXT_PUBLIC_TOKEN_MINT?.trim() ??
  ""

// Treasury owner (pubkey) : on accepte 2 noms aussi.
export const TREASURY_WALLET =
  process.env.SOLANA_TREASURY_WALLET ??
  process.env.SOLANA_TREASURY_SOL ?? // compat avec ton ancien nom
  process.env.NEXT_PUBLIC_RECEIVER_WALLET ??
  ""

// Décimales : on accepte 2 noms
export const TOKEN_DECIMALS = Number(
  process.env.SOLANA_TOKEN_DECIMALS ??
    process.env.NEXT_PUBLIC_TOKEN_DECIMALS ??
    "9"
)
// Prix du personnage (SOL). Priorité à une variable d'env si tu veux le changer sans redeploy.
export const CHARACTER_PRICE_SOL = Number(
  process.env.NEXT_PUBLIC_CHARACTER_PRICE_SOL ?? "0.5"
)

// Prix en lamports (1 SOL = 1_000_000_000 lamports)
export const CHARACTER_PRICE_LAMPORTS = Math.round(CHARACTER_PRICE_SOL * 1_000_000_000)

// Compat: certains fichiers attendent RECEIVER_WALLET
export const RECEIVER_WALLET = TREASURY_WALLET