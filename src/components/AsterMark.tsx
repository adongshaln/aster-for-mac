import { cn } from '@/lib/utils'

export function AsterMark({
  size = 28,
  glow = false,
  className,
}: {
  size?: number
  glow?: boolean
  className?: string
}) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}aster-star-clay.png`}
      width={size}
      height={size}
      alt="Aster"
      draggable={false}
      className={cn('select-none object-contain', glow && 'drop-shadow-[0_0_18px_rgba(217,119,87,0.35)]', className)}
    />
  )
}
