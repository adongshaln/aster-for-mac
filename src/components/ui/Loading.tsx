import { motion } from 'framer-motion'
import { AsterMark } from '@/components/AsterMark'

export function LoadingScreen({ label = '正在打开 Aster' }: { label?: string }) {
  return (
    <div className="app-vibrancy flex h-full w-full flex-col items-center justify-center gap-5">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, rotate: -8 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 20 }}
        className="relative flex size-20 items-center justify-center"
      >
        <div className="absolute inset-0 rounded-full bg-clay/10 blur-2xl" />
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
          className="relative"
        >
          <AsterMark size={64} glow />
        </motion.div>
      </motion.div>
      <div className="flex items-center gap-1.5">
        <span className="typing-dot size-1.5 rounded-full bg-clay" />
        <span className="typing-dot size-1.5 rounded-full bg-clay" />
        <span className="typing-dot size-1.5 rounded-full bg-clay" />
      </div>
      <p className="text-[12px] font-medium tracking-wide text-[var(--cds-text-muted)]">{label}</p>
    </div>
  )
}

export function ThinkingDots({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[3.5px] ${className}`}>
      <span className="typing-dot size-[3px] rounded-full bg-clay" />
      <span className="typing-dot size-[3px] rounded-full bg-clay" />
      <span className="typing-dot size-[3px] rounded-full bg-clay" />
    </span>
  )
}
