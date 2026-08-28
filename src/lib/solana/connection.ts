import { Connection } from "@solana/web3.js"
import { SOLANA_RPC_SERVER } from "./constants"

// Connexion serveur (API routes) : évite les 403 navigateur liés à des RPC privés.
export const solanaConnection = new Connection(SOLANA_RPC_SERVER, "confirmed")