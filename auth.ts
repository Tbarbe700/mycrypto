import NextAuth from "next-auth"
import Google from "next-auth/providers/google"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      // tu peux laisser vide, ça utilisera AUTH_GOOGLE_ID et AUTH_GOOGLE_SECRET
    }),
  ],
})
