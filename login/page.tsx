import { signIn } from "@/auth"

export default function LoginPage() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Connexion</h1>

      <form
        action={async () => {
          "use server"
          await signIn("google", { redirectTo: "/" })
        }}
      >
        <button type="submit">Se connecter avec Google</button>
      </form>
    </main>
  )
}
