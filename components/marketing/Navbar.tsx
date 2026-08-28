import Container from "@/app/components/ui/Container"
import Button from "@/app/components/ui/Button"

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-stroke/10 bg-bg/70 backdrop-blur">
      <Container className="flex h-16 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl border border-stroke/15 bg-panel/60" />
          <span className="font-semibold tracking-wide">DRAKRUN</span>
        </div>

        <nav className="hidden items-center gap-6 text-sm text-muted md:flex">
          <a className="hover:text-text" href="#how">How to Play</a>
          <a className="hover:text-text" href="#market">Marketplace</a>
          <a className="hover:text-text" href="#economy">Economy</a>
          <a className="hover:text-text" href="#faq">FAQ</a>
        </nav>

        <div className="flex items-center gap-2">
          <Button variant="secondary" href="/connect">Connect Wallet</Button>
          <Button variant="secondary" href="/login" className="hidden sm:inline-flex">
            Sign In
          </Button>
        </div>
      </Container>
    </header>
  )
}
