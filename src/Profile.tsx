import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react'
import { supabase } from './lib/supabase'

// First login (CLAUDE.md §6): photo cropped to a circle, nickname, kit colour. Also reachable later to edit.

export const KIT_COLOURS = [
  '#c8102e',
  '#0053a1',
  '#00853f',
  '#f2b226',
  '#000000',
  '#ea5097',
  '#7fc4ef',
  '#713042',
  '#ff6b00',
  '#6b21a8',
]
const OUT = 256 // avatar size in px

export type Me = {
  id: string
  name: string
  nickname: string | null
  avatar_url: string | null
  kit_colour: string | null
}

export function Avatar({
  p,
  size = 40,
}: {
  p: { name: string; nickname: string | null; avatar_url?: string | null; kit_colour?: string | null }
  size?: number
}) {
  const ring = { boxShadow: `0 0 0 3px ${p.kit_colour ?? '#d1d5db'}`, width: size, height: size }
  return p.avatar_url ? (
    <img src={p.avatar_url} alt="" className="shrink-0 rounded-full object-cover" style={ring} />
  ) : (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-gray-200 font-bold text-gray-600"
      style={{ ...ring, fontSize: size * 0.4 }}
    >
      {(p.nickname || p.name).slice(0, 1).toUpperCase()}
    </span>
  )
}

export default function Profile({ me, onSaved }: { me: Me; onSaved: () => void }) {
  const [nickname, setNickname] = useState(me.nickname ?? '')
  const [colour, setColour] = useState(me.kit_colour ?? KIT_COLOURS[0])
  const [img, setImg] = useState<ImageBitmap | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)

  // Draw the crop: image covers the square, then zoom and pan; the circle is CSS on the canvas.
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx || !img) return
    const scale = (OUT / Math.min(img.width, img.height)) * zoom
    const w = img.width * scale
    const h = img.height * scale
    const x = Math.min(0, Math.max(OUT - w, (OUT - w) / 2 + pan.x))
    const y = Math.min(0, Math.max(OUT - h, (OUT - h) / 2 + pan.y))
    ctx.clearRect(0, 0, OUT, OUT)
    ctx.drawImage(img, x, y, w, h)
  }, [img, zoom, pan])

  const move = (e: PointerEvent) => {
    if (!drag.current) return
    const k = OUT / (e.currentTarget as HTMLElement).clientWidth
    setPan((p) => ({ x: p.x + (e.clientX - drag.current!.x) * k, y: p.y + (e.clientY - drag.current!.y) * k }))
    drag.current = { x: e.clientX, y: e.clientY }
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      let avatar_url = me.avatar_url
      if (img && canvas.current) {
        const blob = await new Promise<Blob | null>((r) => canvas.current!.toBlob(r, 'image/jpeg', 0.85))
        // New name each time: insert only (no overwrite), and no stale cached photo.
        const path = `${me.id}/${Date.now()}.jpg`
        const up = await supabase.storage.from('avatars').upload(path, blob!, { contentType: 'image/jpeg' })
        if (up.error) throw up.error
        avatar_url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
      }
      const { error } = await supabase
        .from('players')
        .update({ nickname: nickname.trim(), kit_colour: colour, avatar_url })
        .eq('id', me.id)
      if (error) throw error
      onSaved()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="mx-auto flex max-w-sm flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">{me.nickname ? 'Your profile' : `Welcome, ${me.name}`}</h1>

      <div className="flex flex-col items-center gap-2">
        {img ? (
          <canvas
            ref={canvas}
            width={OUT}
            height={OUT}
            className="h-48 w-48 touch-none rounded-full"
            style={{ boxShadow: `0 0 0 4px ${colour}` }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              drag.current = { x: e.clientX, y: e.clientY }
            }}
            onPointerMove={move}
            onPointerUp={() => (drag.current = null)}
          />
        ) : (
          <Avatar p={{ name: me.name, nickname, avatar_url: me.avatar_url, kit_colour: colour }} size={192} />
        )}
        {img && (
          <label className="flex w-48 items-center gap-2 text-sm">
            Zoom
            <input
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1"
            />
          </label>
        )}
        <label className="cursor-pointer rounded border px-4 py-2">
          {img || me.avatar_url ? 'Change photo' : 'Add a photo'}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              setImg(await createImageBitmap(f))
              setZoom(1)
              setPan({ x: 0, y: 0 })
            }}
          />
        </label>
        {img && <p className="text-xs text-gray-500">Drag to move, slide to zoom.</p>}
      </div>

      <label className="flex flex-col gap-1">
        Nickname
        <input
          required
          maxLength={20}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          className="rounded border p-3 text-lg"
        />
      </label>

      <fieldset>
        <legend className="mb-1">Kit colour</legend>
        <div className="flex flex-wrap gap-2">
          {KIT_COLOURS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              aria-pressed={colour === c}
              onClick={() => setColour(c)}
              className={`h-10 w-10 rounded-full border border-gray-300 ${colour === c ? 'ring-4 ring-offset-2' : ''}`}
              style={{ background: c, ['--tw-ring-color' as string]: c }}
            />
          ))}
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      <button disabled={busy || !nickname.trim()} className="rounded bg-black p-3 text-white disabled:opacity-50">
        {busy ? 'Saving…' : 'Save'}
      </button>
    </form>
  )
}
