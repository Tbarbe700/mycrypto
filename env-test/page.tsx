export default function EnvTestPage() {
  return (
    <pre>
      PRICE: {process.env.NEXT_PUBLIC_CHARACTER_PRICE_SOL}
    </pre>
  )
}
