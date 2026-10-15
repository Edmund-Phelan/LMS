import { useState, type FormEvent } from 'react'
import { supabase } from './lib/supabase'

// Email → 8-digit code (Supabase Auth OTP length; change both together). No magic links (they open in the wrong browser on iPhone), no sign-ups.
export default function Login() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = sent
      ? await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
      : await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
    setBusy(false)
    if (error)
      setError(
        sent
          ? 'That code didn’t work. Check it or send a new one.'
          : `Couldn’t send a code (${error.message}). Is this the email Eddie has for you?`,
      )
    else if (!sent) setSent(true)
  }

  return (
    <form
      onSubmit={submit}
      className="mx-auto flex min-h-dvh max-w-sm flex-col gap-3 bg-navy-900 p-6 pt-[calc(6rem+env(safe-area-inset-top))] font-sans text-chalk"
    >
      <div className="disp flex h-14 w-14 items-center justify-center rounded-2xl bg-gold text-2xl font-extrabold text-navy-900">
        BBB
      </div>
      <p className="disp mt-2 text-xs font-bold tracking-[.18em] text-muted uppercase">Last Man Standing</p>
      <h1 className="disp mb-4 text-4xl leading-none font-extrabold">Sign in</h1>
      {!sent ? (
        <>
          <label htmlFor="email" className="text-sm font-semibold text-chalk-2">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value.trim())}
            className="rounded-[14px] border border-white/16 bg-navy-800 p-3 text-lg outline-none focus:border-gold"
          />
          <button
            disabled={busy}
            className="press h-[50px] rounded-[14px] bg-gold font-bold text-navy-900 disabled:opacity-50"
          >
            Send me a code
          </button>
        </>
      ) : (
        <>
          <label htmlFor="code" className="text-sm font-semibold text-chalk-2">
            8-digit code sent to {email}
          </label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{8}"
            maxLength={8}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="disp rounded-[14px] border border-white/16 bg-navy-800 p-3 text-center text-3xl font-extrabold tracking-widest outline-none focus:border-gold"
          />
          <button
            disabled={busy}
            className="press h-[50px] rounded-[14px] bg-gold font-bold text-navy-900 disabled:opacity-50"
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setSent(false)
              setCode('')
            }}
            className="min-h-11 text-sm font-semibold text-gold"
          >
            Use a different email
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="text-out-text">
          {error}
        </p>
      )}
    </form>
  )
}
