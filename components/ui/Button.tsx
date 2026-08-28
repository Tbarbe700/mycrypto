import Link from "next/link"
import React from "react"

type Props = {
  variant?: "primary" | "secondary"
  href?: string
  className?: string
  children: React.ReactNode
} & React.ButtonHTMLAttributes<HTMLButtonElement>

function cx(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(" ")
}

export default function Button({
  variant = "primary",
  href,
  className,
  children,
  ...props
}: Props) {
  // Fallback minimal (au cas où le CSS custom n’est pas appliqué)
  const fallbackBase =
    "inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold " +
    "border border-stroke/20 bg-panel/40 text-text " +
    "hover:border-stroke/30 hover:bg-panel/55 " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/60"

  const fallbackPrimary =
    "border-ember/35 shadow-[0_0_28px_rgba(255,122,46,0.18)] " +
    "hover:shadow-[0_0_34px_rgba(255,122,46,0.24)]"

  const fallbackSecondary = "opacity-95"

  const classes = cx(
    // Ton style Drakrun (si chargé)
    "btn-drakrun",
    variant === "secondary" && "btn-drakrun--secondary",

    // Fallback (si jamais btn-drakrun n’est pas pris)
    fallbackBase,
    variant === "primary" ? fallbackPrimary : fallbackSecondary,

    className
  )

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    )
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  )
}
