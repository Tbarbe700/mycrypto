import { cn } from "@/src/lib/cn"

export default function Section({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn("py-12 sm:py-16", className)} {...props} />
}
