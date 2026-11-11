import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { PennyChatPanel } from './PennyChatPanel'
import { PennyLauncher } from './PennyLauncher'

export interface PennyAssistantProps {
  /** Optional initial open state (defaults to false). */
  initialOpen?: boolean
}

/**
 * Controller for Penny — Your Personal Money Companion.
 *
 * Stage 4B / Stage 5B controller:
 * - Owns open/closed state for the floating interface.
 * - Coordinates PennyLauncher and PennyChatPanel.
 * - Tracks launcher ref and restores focus to PennyLauncher when panel closes,
 *   except during full-page assistant navigation where focus restoration is suppressed.
 * - Hides the floating launcher and panel on `/assistant` to prevent duplicate views.
 * - Preserves conversation state in AssistantProvider across toggles and routes.
 * - Non-modal desktop presentation and safe mobile presentation.
 */
export function PennyAssistant({ initialOpen = false }: PennyAssistantProps) {
  const [isOpen, setIsOpen] = useState(initialOpen)
  const launcherRef = useRef<HTMLButtonElement | null>(null)
  const previousOpenRef = useRef(initialOpen)
  const isFirstMountRef = useRef(true)
  const suppressFocusRestorationRef = useRef(false)

  const location = useLocation()
  const navigate = useNavigate()

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  const handleClose = useCallback(() => {
    setIsOpen(false)
  }, [])

  const handleOpenFullPage = useCallback(() => {
    suppressFocusRestorationRef.current = true
    setIsOpen(false)
    navigate('/assistant')
  }, [navigate])

  // Focus restoration: when panel transitions from open (true) to closed (false),
  // return focus to the launcher button unless suppressed (e.g. during full-page navigation).
  // Avoid running on initial mount.
  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false
      previousOpenRef.current = isOpen
      return
    }

    if (previousOpenRef.current && !isOpen) {
      if (!suppressFocusRestorationRef.current) {
        const frame = requestAnimationFrame(() => {
          launcherRef.current?.focus()
        })
        previousOpenRef.current = isOpen
        return () => cancelAnimationFrame(frame)
      }
      suppressFocusRestorationRef.current = false
    }

    previousOpenRef.current = isOpen
  }, [isOpen])

  // On the dedicated AssistantPage (/assistant), hide floating launcher and panel
  if (location.pathname === '/assistant') {
    return null
  }

  return (
    <>
      <PennyLauncher
        ref={launcherRef}
        isOpen={isOpen}
        onClick={handleToggle}
      />
      <PennyChatPanel
        open={isOpen}
        onClose={handleClose}
        onOpenFullPage={handleOpenFullPage}
      />
    </>
  )
}
