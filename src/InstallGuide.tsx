import { useState } from 'react'

// iPhone "Add to Home Screen" guide (CLAUDE.md §7), first visit in Safari only. The home-screen app has its
// own login (iOS keeps it separate from Safari), so this shows before sign-in.

const KEY = 'install-guide-dismissed'
const isIosSafari = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) &&
  !/CriOS|FxiOS|EdgiOS|GSA/.test(navigator.userAgent) &&
  !(navigator as Navigator & { standalone?: boolean }).standalone

function dismissed() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

const ShareIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="inline h-5 w-5 align-text-bottom"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M12 3v12M8 7l4-4 4 4M5 11v9h14v-9" />
  </svg>
)

export default function InstallGuide() {
  const [show, setShow] = useState(() => isIosSafari() && !dismissed())
  if (!show) return null
  const close = () => {
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      /* private mode: it just shows again next time */
    }
    setShow(false)
  }
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/50" role="dialog" aria-label="Add to Home Screen">
      <div className="w-full rounded-t-3xl bg-navy-800 p-5 text-chalk font-sans pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <h2 className="disp mb-1 text-2xl font-extrabold">Put it on your home screen</h2>
        <p className="mb-4 text-sm text-muted">It works like an app, full screen, one tap away.</p>
        <ol className="mb-5 flex flex-col gap-3">
          <li className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold font-bold text-navy-900">
              1
            </span>
            <span>
              Tap the Share button <ShareIcon /> at the bottom of Safari.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold font-bold text-navy-900">
              2
            </span>
            <span>
              Scroll down and tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold font-bold text-navy-900">
              3
            </span>
            <span>
              Open <strong>BBB LMS</strong> from your home screen and sign in there (not here in Safari).
            </span>
          </li>
        </ol>
        <button onClick={close} className="press h-[50px] w-full rounded-[14px] bg-gold font-bold text-navy-900">
          Got it
        </button>
      </div>
    </div>
  )
}
