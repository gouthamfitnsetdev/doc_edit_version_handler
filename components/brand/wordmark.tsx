import { cn } from "@/lib/utils"

interface WordmarkProps {
  className?: string
  size?: "sm" | "md" | "lg" | "xl"
  invert?: boolean
}

const sizes = {
  sm: "text-xl",
  md: "text-2xl",
  lg: "text-4xl",
  xl: "text-6xl",
}

export function Wordmark({ className, size = "md", invert = false }: WordmarkProps) {
  return (
    <span
      className={cn(
        "leading-none tracking-tight select-none",
        sizes[size],
        invert ? "text-white" : "text-[#0C0C0C]",
        className,
      )}
      style={{ fontFamily: "var(--font-playfair), Georgia, serif", fontWeight: 600 }}
    >
      doc
      <span style={{ fontStyle: "italic", fontWeight: 400 }}>editor</span>
    </span>
  )
}
