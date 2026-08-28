import Image from "next/image"

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-hero">
      {children}
    </div>
  )
}
