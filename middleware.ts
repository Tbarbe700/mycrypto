import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const { pathname } = req.nextUrl

  // Autoriser la page login + les routes NextAuth
  const isAuthRoute = pathname.startsWith("/api/auth")
  const isLoginPage = pathname === "/login"

  if (isAuthRoute || isLoginPage) return NextResponse.next()

  // Si pas connecté → redirection login
  if (!isLoggedIn) {
    const url = req.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
})

// On applique le middleware partout sauf sur les assets Next.js
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
