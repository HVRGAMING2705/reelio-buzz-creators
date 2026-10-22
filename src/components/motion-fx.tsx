import { useRef, type ReactNode, type MouseEvent } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";

/* ============ Magnetic Button ============ */
export function Magnetic({
  children,
  strength = 0.35,
  className = "",
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 200, damping: 15, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 200, damping: 15, mass: 0.4 });

  const handleMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * strength);
    y.set((e.clientY - (r.top + r.height / 2)) * strength);
  };
  const handleLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{ x: sx, y: sy }}
      className={`inline-block ${className}`}
    >
      {children}
    </motion.div>
  );
}

/* ============ Tilt Card (static: tilt + spotlight removed; `max` kept for API compatibility) ============ */
export function TiltCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
  max?: number;
}) {
  return <div className={className}>{children}</div>;
}

/* ============ Cursor follower ============ */
export function CursorGlow() {
  const x = useMotionValue(-200);
  const y = useMotionValue(-200);
  const sx = useSpring(x, { stiffness: 150, damping: 20, mass: 0.5 });
  const sy = useSpring(y, { stiffness: 150, damping: 20, mass: 0.5 });

  if (typeof window !== "undefined") {
    window.onmousemove = (e) => {
      x.set(e.clientX);
      y.set(e.clientY);
    };
  }

  const tx = useTransform(sx, (v) => v - 220);
  const ty = useTransform(sy, (v) => v - 220);

  return (
    <motion.div
      aria-hidden
      style={{ x: tx, y: ty }}
      className="pointer-events-none fixed left-0 top-0 z-[60] h-[440px] w-[440px] rounded-full mix-blend-screen"
    >
      <div
        className="h-full w-full rounded-full"
        style={{
          background:
            "radial-gradient(circle, oklch(1 0 0 / 0.18), oklch(1 0 0 / 0.05) 40%, transparent 65%)",
          filter: "blur(20px)",
        }}
      />
    </motion.div>
  );
}
