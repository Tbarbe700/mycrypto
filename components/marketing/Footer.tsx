import Container from "@/app/components/ui/Container"

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-stroke/10 bg-bg/50">
      <Container className="py-10">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="text-sm text-muted">
            © {new Date().getFullYear()} DRAKRUN — All rights reserved.
          </div>

          <div className="flex items-center gap-4 text-sm text-muted">
            <a className="hover:text-text" href="/terms">Terms</a>
            <a className="hover:text-text" href="/privacy">Privacy</a>
            <a className="hover:text-text" href="/contact">Contact</a>
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-muted">
          Produit en phase alpha — visuels temporaires, gameplay et économie susceptibles d’évoluer.
        </div>
      </Container>
    </footer>
  )
}
