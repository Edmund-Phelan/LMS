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
    <form onSubmit={submit} className="mx-auto flex max-w-sm flex-col gap-3 p-6 pt-24">
      <h1 className="text-2xl font-bold">Champions Cup LMS</h1>
      {!sent ? (
        <>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value.trim())}
            className="rounded border p-3 text-lg"
          />
          <button disabled={busy} className="rounded bg-black p-3 text-white disabled:opacity-50">
            Send me a code
          </button>
        </>
      ) : (
        <>
          <label htmlFor="code">8-digit code sent to {email}</label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{8}"
            maxLength={8}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="rounded border p-3 text-center text-2xl tracking-widest"
          />
          <button disabled={busy} className="rounded bg-black p-3 text-white disabled:opacity-50">
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setSent(false)
              setCode('')
            }}
            className="text-sm underline"
          >
            Use a different email
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
    </form>
  )
}
