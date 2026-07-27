import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Magnetic, TiltCard } from "@/components/motion-fx";

/* ---------- 1. Liquid blob field ---------- */
function LiquidBlob() {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 200 200">
        <defs>
          <radialGradient id="bg1" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="oklch(0.72 0.24 25)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="oklch(0.35 0.15 25)" stopOpacity="0" />
          </radialGradient>
          <filter id="goo">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feColorMatrix in="blur" mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" />
          </filter>
        </defs>
        <g filter="url(#goo)">
          {[
            { cx: 60, cy: 80, r: 34, dur: 7 },
            { cx: 140, cy: 110, r: 30, dur: 9 },
            { cx: 100, cy: 60, r: 26, dur: 6 },
            { cx: 110, cy: 150, r: 32, dur: 11 },
          ].map((b, i) => (
            <motion.circle
              key={i}
              cx={b.cx}
              cy={b.cy}
              r={b.r}
              fill="url(#bg1)"
              animate={{
                cx: [b.cx, b.cx + 30, b.cx - 20, b.cx],
                cy: [b.cy, b.cy - 25, b.cy + 30, b.cy],
              }}
              transition={{ duration: b.dur, repeat: Infinity, ease: "easeInOut" }}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

/* ---------- 2. Cursor spotlight card ---------- */
function SpotlightCard() {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--sx", `${((e.clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty("--sy", `${((e.clientY - r.top) / r.height) * 100}%`);
  };
  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      className="relative h-full w-full rounded-3xl glass overflow-hidden grid place-items-center"
      style={{
        backgroundImage:
          "radial-gradient(400px circle at var(--sx,50%) var(--sy,50%), oklch(0.85 0.2 25 / 0.35), transparent 60%)",
      }}
    >
      <div className="text-center px-4">
        <p className="text-[10px] uppercase tracking-[0.4em] opacity-70">Move cursor</p>
        <p className="mt-2 text-2xl">Spotlight</p>
      </div>
    </div>
  );
}

/* ---------- 3. Ripple on click ---------- */
function RipplePad() {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const idRef = useRef(0);
  const spawn = (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const id = ++idRef.current;
    setRipples((rs) => [...rs, { id, x: e.clientX - r.left, y: e.clientY - r.top }]);
    setTimeout(() => setRipples((rs) => rs.filter((rp) => rp.id !== id)), 900);
  };
  return (
    <button
      onClick={spawn}
      className="relative h-full w-full rounded-3xl glass overflow-hidden grid place-items-center group"
    >
      <span className="text-center">
        <span className="text-[10px] uppercase tracking-[0.4em] opacity-70">Tap anywhere</span>
        <span className="mt-2 block text-2xl">Ripple</span>
      </span>
      {ripples.map((r) => (
        <motion.span
          key={r.id}
          initial={{ opacity: 0.5, scale: 0 }}
          animate={{ opacity: 0, scale: 6 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          style={{ left: r.x, top: r.y }}
          className="pointer-events-none absolute h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/40"
        />
      ))}
    </button>
  );
}

/* ---------- 4. Draggable glass chip ---------- */
function DragChip() {
  return (
    <div className="relative h-full w-full rounded-3xl glass overflow-hidden grid place-items-center">
      <p className="absolute top-4 left-4 text-[10px] uppercase tracking-[0.4em] opacity-70">
        Drag me
      </p>
      <motion.div
        drag
        dragConstraints={{ left: -70, right: 70, top: -50, bottom: 50 }}
        dragElastic={0.4}
        whileTap={{ scale: 0.95 }}
        className="h-24 w-24 rounded-2xl glass-chip conic-border grid place-items-center text-3xl cursor-grab active:cursor-grabbing"
      >
        ✦
      </motion.div>
    </div>
  );
}

/* ---------- 5. Text shimmer word ---------- */
function ShimmerWord() {
  return (
    <div className="relative h-full w-full rounded-3xl glass overflow-hidden grid place-items-center">
      <div className="text-center">
        <p className="text-[10px] uppercase tracking-[0.4em] opacity-70">Text shimmer</p>
        <p className="mt-2 text-4xl md:text-5xl text-shimmer leading-none">REELIO</p>
      </div>
    </div>
  );
}

/* ---------- 6. Magnetic + tilt combo ---------- */
function MagneticTilt() {
  return (
    <TiltCard className="h-full w-full" max={16}>
      <div
        className="relative h-full w-full rounded-3xl glass overflow-hidden grid place-items-center"
        style={{
          backgroundImage:
            "radial-gradient(240px circle at var(--mx,50%) var(--my,50%), oklch(1 0 0 / 0.18), transparent 55%)",
        }}
      >
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-[0.4em] opacity-70">Hover</p>
          <p className="mt-2 text-2xl">3D Tilt</p>
          <Magnetic strength={0.5} className="mt-4">
            <span className="inline-block rounded-full bg-white text-[color:var(--reelio-black)] px-5 py-2 text-[11px] uppercase tracking-[0.2em]">
              Magnetic
            </span>
          </Magnetic>
        </div>
      </div>
    </TiltCard>
  );
}

/* ---------- 7. Orbit ---------- */
function OrbitDemo() {
  return (
    <div className="relative h-full w-full rounded-3xl glass overflow-hidden grid place-items-center">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
        className="relative h-40 w-40"
      >
        {["🎬", "📸", "✂️", "📈"].map((e, i) => {
          const angle = (i / 4) * Math.PI * 2;
          const r = 70;
          return (
            <span
              key={i}
              style={{
                left: `calc(50% + ${Math.cos(angle) * r}px)`,
                top: `calc(50% + ${Math.sin(angle) * r}px)`,
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 h-10 w-10 rounded-full glass-chip grid place-items-center text-lg"
            >
              <motion.span
                animate={{ rotate: -360 }}
                transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
              >
                {e}
              </motion.span>
            </span>
          );
        })}
      </motion.div>
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="h-16 w-16 rounded-full bg-[color:var(--reelio-red)]/70 blur-2xl" />
      </div>
      <p className="absolute bottom-4 text-[10px] uppercase tracking-[0.4em] opacity-70">Orbit</p>
    </div>
  );
}

/* ---------- 8. Progress ring bound to a motion value ---------- */
function ProgressRing() {
  const v = useMotionValue(0);
  const sv = useSpring(v, { stiffness: 60, damping: 20 });
  const dash = useTransform(sv, (n) => `${n * 2.83} 999`);
  const label = useTransform(sv, (n) => `${Math.round(n)}%`);
  useEffect(() => {
    let up = true;
    const id = setInterval(() => {
      v.set(up ? 100 : 0);
      up = !up;
    }, 2200);
    return () => clearInterval(id);
  }, [v]);
  return (
    <div className="relative h-full w-full rounded-3xl glass overflow-hidden grid place-items-center">
      <svg viewBox="0 0 100 100" className="h-32 w-32 -rotate-90">
        <circle cx="50" cy="50" r="45" fill="none" stroke="oklch(1 0 0 / 0.1)" strokeWidth="6" />
        <motion.circle
          cx="50" cy="50" r="45" fill="none"
          stroke="oklch(0.85 0.2 25)"
          strokeWidth="6"
          strokeLinecap="round"
          style={{ strokeDasharray: dash }}
        />
      </svg>
      <motion.span className="absolute text-xl">{label}</motion.span>
      <p className="absolute bottom-4 text-[10px] uppercase tracking-[0.4em] opacity-70">Spring</p>
    </div>
  );
}

/* ---------- Section ---------- */
export function MotionShowcase() {
  const tiles: { title: string; hint: string; render: () => JSX.Element }[] = [
    { title: "Liquid Blob", hint: "SVG goo filter + motion", render: () => <LiquidBlob /> },
    { title: "Spotlight", hint: "Cursor-follow gradient", render: () => <SpotlightCard /> },
    { title: "Ripple", hint: "Click to spawn", render: () => <RipplePad /> },
    { title: "Drag", hint: "Elastic constraints", render: () => <DragChip /> },
    { title: "Shimmer", hint: "Gradient text loop", render: () => <ShimmerWord /> },
    { title: "3D Tilt", hint: "Perspective transform", render: () => <MagneticTilt /> },
    { title: "Orbit", hint: "Nested rotation", render: () => <OrbitDemo /> },
    { title: "Spring", hint: "Motion value binding", render: () => <ProgressRing /> },
  ];

  return (
    <section
      id="motion"
      className="relative mx-auto max-w-7xl px-5 md:px-10 py-24 md:py-36"
    >
      <div className="reveal mb-14 max-w-2xl">
        <p className="text-[10px] uppercase tracking-[0.4em] opacity-70">✦ Motion lab</p>
        <h2 className="mt-4 text-5xl md:text-7xl leading-[0.95]">
          Built on <span className="text-shimmer">liquid glass</span> and physics.
        </h2>
        <p className="mt-6 opacity-80 md:text-lg">
          Every surface on this site is alive. Hover, click, drag — the same motion
          language powers your brand's reels, ads, and campaigns.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6 reveal">
        {tiles.map((t, i) => (
          <motion.div
            key={t.title}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
            className="group"
          >
            <div className="relative aspect-square rounded-3xl overflow-hidden">
              {t.render()}
            </div>
            <div className="mt-3 flex items-baseline justify-between gap-2">
              <span className="text-sm md:text-base">{t.title}</span>
              <span className="text-[10px] uppercase tracking-[0.25em] opacity-60">
                {t.hint}
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
