import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

const VIEW = 240; // crop window, CSS px
const OUT = 256; // saved avatar, px

/**
 * Square avatar crop: drag (or arrow keys) to position, slider to zoom.
 * Produces a small JPEG data URL so it fits comfortably in browser storage.
 */
export function AvatarCropper({ file, onCancel, onDone }: { file: File; onCancel: () => void; onDone: (dataUrl: string) => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    ref.current?.showModal();
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => setImg(image);
    image.onerror = () => setError("That file isn't an image this browser can open. Try a JPG or PNG.");
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const base = img ? Math.max(VIEW / img.naturalWidth, VIEW / img.naturalHeight) : 1;
  const w = img ? img.naturalWidth * base * zoom : VIEW;
  const h = img ? img.naturalHeight * base * zoom : VIEW;
  const clamp = (o: { x: number; y: number }) => ({
    x: Math.max(-(w - VIEW) / 2, Math.min((w - VIEW) / 2, o.x)),
    y: Math.max(-(h - VIEW) / 2, Math.min((h - VIEW) / 2, o.y)),
  });
  const pos = clamp(offset);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y };
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    setOffset(clamp({ x: drag.current.ox + e.clientX - drag.current.x, y: drag.current.oy + e.clientY - drag.current.y }));
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 20 : 6;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    setOffset(clamp({ x: pos.x + m[0], y: pos.y + m[1] }));
  }

  function save() {
    if (!img) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const k = OUT / VIEW;
    ctx.drawImage(img, (VIEW / 2 + pos.x - w / 2) * k, (VIEW / 2 + pos.y - h / 2) * k, w * k, h * k);
    onDone(canvas.toDataURL("image/jpeg", 0.85));
  }

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="avatar-crop-title"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <div className="p-6">
        <h2 id="avatar-crop-title" className="font-heading text-lg font-bold text-[var(--color-ns-text)]">
          Position your photo
        </h2>
        {error ? (
          <p className="mt-3 text-sm text-[var(--color-ns-amber)]">{error}</p>
        ) : (
          <>
            <p className="mt-1 text-[0.8125rem] text-[var(--color-ns-muted)]">Drag, or use the arrow keys, to move it. The circle is what others will see.</p>
            <div
              tabIndex={0}
              role="img"
              aria-label="Photo crop preview. Use arrow keys to move the photo."
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={() => (drag.current = null)}
              onKeyDown={onKeyDown}
              className="relative mx-auto mt-4 cursor-grab touch-none overflow-hidden rounded-2xl bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ns-purple-light)] active:cursor-grabbing"
              style={{ width: VIEW, height: VIEW }}
            >
              {img && (
                <img
                  src={img.src}
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute max-w-none select-none"
                  style={{ width: w, height: h, left: VIEW / 2 + pos.x - w / 2, top: VIEW / 2 + pos.y - h / 2 }}
                />
              )}
              {/* Darken everything outside the circle the avatar will show. */}
              <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]" />
            </div>
            <label className="mt-4 flex items-center gap-3 text-[0.8125rem] text-[var(--color-ns-muted)]">
              Zoom
              <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="ns-range flex-1"
                style={{ "--pct": `${((zoom - 1) / 2) * 100}%` } as React.CSSProperties} />
            </label>
          </>
        )}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={save} disabled={!img}>
            Use photo
          </button>
        </div>
      </div>
    </dialog>
  );
}
