import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Scroll pinning physics adapted from CDS `useClaudeScrollPinning`:
 * a 150 ms user-input cooldown, a 40 px bottom tolerance, and a jump control
 * that appears once the reader has intentionally left the live edge.
 */
export function useScrollPinning(dependencies: unknown[]) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isPinned, setIsPinned] = useState(true)
  const [atTop, setAtTop] = useState(true)
  const [atBottom, setAtBottom] = useState(true)
  const [showJumpControl, setShowJumpControl] = useState(false)
  const lastUserInputAt = useRef(0)
  const programmaticScroll = useRef(false)

  const markUserInput = useCallback(() => {
    lastUserInputAt.current = performance.now()
  }, [])

  const handleScroll = useCallback(() => {
    if (programmaticScroll.current) {
      programmaticScroll.current = false
      return
    }
    const element = containerRef.current
    if (!element) return
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    const pinned = distance <= 40
    setIsPinned(pinned)
    setAtTop(element.scrollTop <= 2)
    setAtBottom(distance <= 2)
    setShowJumpControl(distance > 140)
  }, [])

  const scrollToBottom = useCallback((smooth = false) => {
    const element = containerRef.current
    if (!element) return
    programmaticScroll.current = true
    element.scrollTo({ top: element.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    setIsPinned(true)
    setAtBottom(true)
    setShowJumpControl(false)
  }, [])

  useEffect(() => {
    if (performance.now() - lastUserInputAt.current <= 150) return
    if (isPinned) scrollToBottom(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies)

  return {
    containerRef,
    isPinned,
    atTop,
    atBottom,
    showJumpControl,
    markUserInput,
    handleScroll,
    scrollToBottom,
  }
}
