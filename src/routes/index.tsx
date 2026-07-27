import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  AnimatePresence,
  type Variants,
} from "motion/react";
import logoAsset from "@/assets/reelio-logo.jpeg.asset.json";
import { useReveal } from "@/hooks/use-reveal";
import { Magnetic, TiltCard, CursorGlow } from "@/components/motion-fx";
import { BookingModal } from "@/components/booking-modal";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Reelio SMMA — Content, Creators & Growth" },
      {
        name: "description",
        content:
          "Reelio is a social media marketing agency delivering content, shoots, reels, ads, and outreach for brands that want to grow.",
      },
      { property: "og:title", content: "Reelio SMMA — Content, Creators & Growth" },
      {
        property: "og:description",
        content: "Content creation, photo/video, editing, design, ads and outreach — all under one reel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const services = [
  { icon: "🎬", title: "Content Creation", desc: "High-quality, platform-ready content for Instagram, Reels, and campaigns." },
  { icon: "📸", title: "Photo & Video", desc: "Brand shoots, products, events, and cinematic visuals that tell your story." },
  { icon: "✂️", title: "Editing & Design", desc: "Reels, thumbnails, posters, creatives, and brand assets end-to-end." },
  { icon: "📈", title: "Digital Marketing", desc: "Strategy, Meta ads, content planning, and performance optimization." },
  { icon: "🤝", title: "Outreach & Growth", desc: "Influencer outreach, brand collaborations, and community growth." },
  { icon: "🧍", title: "Models & Creators", desc: "Professional models and creators for campaigns, shoots, and promos." },
];

const niches = [
  { emoji: "🚀", title: "New Startups", desc: "Brand identity, launch content, and digital visibility from day one." },
  { emoji: "👗", title: "Fashion Brands", desc: "Campaign shoots, reels, lookbooks, and social media creatives." },
  { emoji: "☕", title: "Cafés & Food", desc: "Menu shoots, ambience videos, reels, and local audience growth." },
  { emoji: "💪", title: "Gyms & Fitness", desc: "Transformation videos, trainer content, and performance marketing." },
  { emoji: "🎪", title: "Event Marketing", desc: "Event coverage, promo reels, after-movies, and digital buzz." },
];

const packageIncludes = [
  { icon: "📅", title: "Daily Content", desc: "Posts + Reels every week following our weekly structure." },
  { icon: "🔥", title: "10–14 Stories / week", desc: "Engaging, on-brand stories that keep audiences hooked." },
  { icon: "📣", title: "1–3 Meta Ads / week", desc: "Full setup, targeting, and management by our team." },
  { icon: "⭐", title: "1–5 Highlights / week", desc: "Curated highlight covers and story sets." },
  { icon: "📷", title: "On-Site Shoots", desc: "Dedicated videographer + photographer. Models on request." },
  { icon: "🎞️", title: "Editing & Graphics", desc: "Reels, posts, stories, thumbnails, and all graphics." },
  { icon: "📊", title: "Strategy & Growth", desc: "Content strategy, growth planning, weekly optimization." },
  { icon: "💼", title: "Outreach Support", desc: "Brand and creator outreach to accelerate growth." },
];

const marqueeItems = [
  "Trend Analysis", "Photography", "Videography", "Editing", "Graphic Design",
  "Digital Marketing", "Meta Ads", "Outreach", "Models", "Reels",
];

const orbitIcons = ["🎬", "📸", "✂️", "🎨", "📈", "🤝", "⭐", "🚀"];

/* Staggered word reveal */
function SplitWords({ text, className = "", delay = 0 }: { text: string; className?: string; delay?: number }) {
  const words = text.split(" ");
  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.08, delayChildren: delay } },
  };
  const word: Variants = {
    hidden: { y: "110%", opacity: 0 },
    show: { y: 0, opacity: 1, transition: { type: "spring", stiffness: 120, damping: 18 } },
  };
  return (
    <motion.span
      variants={container}
      initial="hidden"
      animate="show"
      className={`inline-flex flex-wrap gap-x-[0.25em] overflow-hidden ${className}`}
    >
      {words.map((w, i) => (
        <span key={i} className="inline-block overflow-hidden">
          <motion.span variants={word} className="inline-block">
            {w}
          </motion.span>
        </span>
      ))}
    </motion.span>
  );
}

function Index() {
  useReveal();
  const [scrolled, setScrolled] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);

  const { scrollY } = useScroll();
  const heroY = useTransform(scrollY, [0, 800], [0, -180]);
  const heroOpacity = useTransform(scrollY, [0, 500], [1, 0.3]);
  const heroScale = useTransform(scrollY, [0, 800], [1, 0.94]);

  // Scroll progress bar
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 100, damping: 20, restDelta: 0.001 });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="relative min-h-screen bg-background text-foreground overflow-hidden">
      <CursorGlow />
      <BookingModal open={bookingOpen} onClose={() => setBookingOpen(false)} />

      {/* Scroll progress bar */}
      <motion.div
        style={{ scaleX: progress, transformOrigin: "0% 50%" }}
        className="fixed top-0 left-0 right-0 h-[3px] bg-white z-[70]"
      />

      {/* ============ ANIMATED BACKGROUND ============ */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 aurora opacity-90" />
        <motion.div
          animate={{ x: [0, 80, -40, 0], y: [0, -60, 40, 0], scale: [1, 1.15, 0.95, 1] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full blur-3xl opacity-70"
          style={{ background: "radial-gradient(circle, oklch(0.75 0.22 30) 0%, transparent 70%)" }}
        />
        <motion.div
          animate={{ x: [0, -80, 60, 0], y: [0, 60, -30, 0], scale: [1, 1.2, 0.9, 1] }}
          transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/3 -right-40 h-[600px] w-[600px] rounded-full blur-3xl opacity-60"
          style={{ background: "radial-gradient(circle, oklch(0.35 0.12 15) 0%, transparent 70%)" }}
        />
        <div
          className="absolute inset-0 opacity-[0.06] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
          }}
        />
      </div>

      {/* ============ NAV ============ */}
      <motion.header
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 120, damping: 18, delay: 0.1 }}
        className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 transition-all duration-500 ${
          scrolled ? "w-[94%] max-w-5xl" : "w-[96%] max-w-6xl"
        }`}
      >
        <div className="glass conic-border rounded-full px-4 md:px-6 h-14 flex items-center justify-between">
          <a href="#top" className="flex items-center gap-2.5">
            <motion.img
              whileHover={{ rotate: 360 }}
              transition={{ duration: 0.9 }}
              src={logoAsset.url}
              alt="Reelio"
              className="h-8 w-8 rounded-lg object-cover ring-1 ring-white/40"
            />
            <span className="text-xl tracking-wide">REELIO</span>
          </a>
          <nav className="hidden md:flex items-center gap-7 text-xs uppercase tracking-[0.25em]">
            {["services", "niches", "package"].map((l) => (
              <motion.a
                key={l}
                href={`#${l}`}
                whileHover={{ y: -2 }}
                className="hover:opacity-80"
              >
                {l}
              </motion.a>
            ))}
          </nav>
          <Magnetic strength={0.4}>
            <button
              type="button"
              onClick={() => setBookingOpen(true)}
              className="glass-chip rounded-full px-4 py-1.5 text-xs uppercase tracking-[0.2em] liquid-shine inline-block"
            >
              Book a call
            </button>
          </Magnetic>
        </div>
      </motion.header>

      {/* ============ HERO ============ */}
      <section id="top" ref={heroRef} className="relative pt-36 pb-28 md:pt-48 md:pb-40">
        <motion.div
          style={{ y: heroY, opacity: heroOpacity, scale: heroScale }}
          className="mx-auto max-w-7xl px-5 md:px-10"
        >
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 glass-chip rounded-full px-4 py-1.5 text-[10px] uppercase tracking-[0.3em]"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
            </span>
            Now booking for 2026
          </motion.div>

          <h1 className="mt-8 text-[19vw] md:text-[9.5vw] leading-[0.88] font-normal">
            <span className="block text-shimmer">
              <SplitWords text="REELS." delay={0.3} />
            </span>
            <span className="block text-shimmer" style={{ animationDelay: "-2s" }}>
              <SplitWords text="BRANDS." delay={0.45} />
            </span>
            <span className="block">
              <SplitWords text="GROWTH." delay={0.6} />
            </span>
          </h1>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.9 }}
            className="mt-12 md:mt-16 grid md:grid-cols-2 gap-8 items-end"
          >
            <p className="text-lg md:text-2xl max-w-xl opacity-95 text-balance">
              Reelio builds the content, shoots the story, runs the ads, and grows the brand — all under one reel.
            </p>
            <div className="flex flex-wrap gap-3 md:justify-end">
              <Magnetic>
                <button
                  type="button"
                  onClick={() => setBookingOpen(true)}
                  className="group relative inline-flex items-center gap-2 rounded-full bg-white text-[color:var(--reelio-black)] px-6 py-3.5 uppercase tracking-[0.2em] text-xs liquid-shine shadow-2xl"
                >
                  Book a call
                  <motion.span animate={{ x: [0, 4, 0] }} transition={{ duration: 1.8, repeat: Infinity }}>
                    →
                  </motion.span>
                </button>
              </Magnetic>
              <Magnetic>
                <a
                  href="#services"
                  className="glass rounded-full px-6 py-3.5 uppercase tracking-[0.2em] text-xs inline-block"
                >
                  Explore
                </a>
              </Magnetic>
            </div>
          </motion.div>

          {/* Orbit + logo */}
          <div className="relative mt-16 md:mt-24 mx-auto h-64 md:h-80 max-w-2xl block">
            <div className="absolute inset-0 grid place-items-center">
              <motion.img
                animate={{ rotate: [0, 6, -6, 0] }}
                transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                src={logoAsset.url}
                alt=""
                className="h-32 w-32 rounded-3xl object-cover ring-2 ring-white/40 shadow-2xl"
              />
            </div>
            <div className="absolute inset-0 orbit">
              {orbitIcons.map((ic, i) => {
                const angle = (i / orbitIcons.length) * Math.PI * 2;
                const r = 150;
                const x = Math.cos(angle) * r;
                const y = Math.sin(angle) * r;
                return (
                  <div
                    key={i}
                    className="absolute left-1/2 top-1/2 glass-chip rounded-full h-11 w-11 grid place-items-center text-lg"
                    style={{ transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))` }}
                  >
                    {ic}
                  </div>
                );
              })}
            </div>
            <div className="absolute inset-0 grid place-items-center pointer-events-none">
              <div
                className="h-[300px] w-[300px] rounded-full border border-white/20"
                style={{ boxShadow: "inset 0 0 40px oklch(1 0 0 / 0.1)" }}
              />
            </div>
          </div>

          {/* Stat cards */}
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {[
              { k: "50+", v: "Brands scaled" },
              { k: "10M+", v: "Reels views" },
              { k: "24/7", v: "Content engine" },
              { k: "6", v: "Core services" },
            ].map((s, i) => (
              <motion.div
                key={s.v}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ delay: i * 0.1, type: "spring", stiffness: 100 }}
                whileHover={{ y: -6 }}
                className="glass spotlight rounded-2xl p-5 md:p-6"
              >
                <div className="text-3xl md:text-4xl">{s.k}</div>
                <div className="mt-1 text-[10px] md:text-xs uppercase tracking-[0.2em] opacity-80">{s.v}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ============ MARQUEE ============ */}
      <section className="relative py-6 border-y border-white/15 overflow-hidden glass-dark">
        <motion.div
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          className="flex whitespace-nowrap gap-12 text-lg md:text-2xl uppercase tracking-[0.3em] opacity-90"
        >
          {[...marqueeItems, ...marqueeItems].map((it, i) => (
            <span key={i} className="flex items-center gap-12">
              {it}
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                className="opacity-60 inline-block"
              >
                ✦
              </motion.span>
            </span>
          ))}
        </motion.div>
      </section>

      {/* ============ SERVICES ============ */}
      <section id="services" className="relative mx-auto max-w-7xl px-5 md:px-10 py-24 md:py-36">
        <div className="flex items-end justify-between flex-wrap gap-6 mb-14 reveal">
          <div>
            <p className="text-[10px] uppercase tracking-[0.4em] opacity-80">🚀 What we do</p>
            <h2 className="mt-4 text-6xl md:text-8xl">
              Our <span className="text-shimmer">Services</span>
            </h2>
          </div>
          <p className="max-w-md opacity-90 text-lg">
            End-to-end social media — from the first frame to the final click.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {services.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ delay: i * 0.06, type: "spring", stiffness: 90, damping: 16 }}
            >
              <TiltCard className="h-full">
                <article className="glass spotlight liquid-shine group relative rounded-3xl p-7 md:p-8 h-full">
                  <div className="flex items-center justify-between">
                    <motion.div
                      whileHover={{ scale: 1.2, rotate: 8 }}
                      transition={{ type: "spring", stiffness: 200 }}
                      className="text-4xl"
                    >
                      {s.icon}
                    </motion.div>
                    <div className="glass-chip rounded-full h-8 w-8 grid place-items-center text-xs opacity-90">
                      0{i + 1}
                    </div>
                  </div>
                  <h3 className="mt-10 text-3xl md:text-4xl">{s.title}</h3>
                  <p className="mt-3 opacity-90 leading-relaxed">{s.desc}</p>
                  <div className="mt-8 flex items-center gap-2 text-xs uppercase tracking-[0.2em] opacity-90">
                    Learn more
                    <motion.span
                      animate={{ x: [0, 4, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="inline-block"
                    >
                      →
                    </motion.span>
                  </div>
                </article>
              </TiltCard>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ============ NICHES ============ */}
      <section id="niches" className="relative py-24 md:py-36">
        <div className="mx-auto max-w-7xl px-5 md:px-10">
          <div className="reveal">
            <p className="text-[10px] uppercase tracking-[0.4em] opacity-80">🎯 Niches</p>
            <h2 className="mt-4 text-6xl md:text-8xl">Who we work with</h2>
          </div>

          <div className="mt-10 flex flex-wrap gap-3">
            {["Startups", "Fashion", "Cafés", "Fitness", "Events"].map((n, i) => (
              <motion.span
                key={n}
                initial={{ opacity: 0, scale: 0.6 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, type: "spring", stiffness: 200 }}
                whileHover={{ scale: 1.08, y: -3 }}
                className="glass-chip rounded-full px-5 py-2 uppercase tracking-[0.25em] text-xs liquid-shine cursor-default"
              >
                {n}
              </motion.span>
            ))}
          </div>

          <div className="mt-14 grid md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {niches.map((n, i) => (
              <motion.div
                key={n.title}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ delay: i * 0.08, type: "spring", stiffness: 90 }}
              >
                <TiltCard max={8}>
                  <article className="glass spotlight rounded-3xl p-7 md:p-8">
                    <motion.div
                      animate={{ y: [0, -8, 0] }}
                      transition={{ duration: 3 + i * 0.4, repeat: Infinity, ease: "easeInOut" }}
                      className="text-4xl"
                    >
                      {n.emoji}
                    </motion.div>
                    <h3 className="mt-8 text-2xl md:text-3xl">{n.title}</h3>
                    <p className="mt-3 opacity-90">{n.desc}</p>
                  </article>
                </TiltCard>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ PACKAGE ============ */}
      <section id="package" className="relative mx-auto max-w-7xl px-5 md:px-10 py-24 md:py-36">
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ type: "spring", stiffness: 80 }}
          className="glass conic-border rounded-[2.5rem] p-6 md:p-14 relative overflow-hidden"
        >
          <motion.div
            animate={{ x: [0, 60, -30, 0], y: [0, -30, 40, 0] }}
            transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
            className="absolute -top-24 -right-24 h-72 w-72 rounded-full blur-3xl opacity-60"
            style={{ background: "radial-gradient(circle, oklch(1 0 0 / 0.4), transparent 70%)" }}
          />
          <div className="relative">
            <p className="text-[10px] uppercase tracking-[0.4em] opacity-80">💎 Monthly Plan</p>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
              <h2 className="text-5xl md:text-8xl">
                <span className="text-shimmer">Reelio</span> Package
              </h2>
              <div className="text-right">
                <div className="text-5xl md:text-7xl">₹50,000</div>
                <div className="uppercase tracking-[0.25em] text-[10px] md:text-xs opacity-80 mt-2">
                  per month · reach focused
                </div>
              </div>
            </div>
            <p className="mt-6 max-w-2xl opacity-90 text-lg">
              Everything a brand needs to stay consistent and grow across Instagram, Facebook, and YouTube.
            </p>

            <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              {packageIncludes.map((item, i) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05, type: "spring", stiffness: 100 }}
                  whileHover={{ y: -6, scale: 1.02 }}
                  className="glass-chip spotlight rounded-2xl p-5"
                >
                  <div className="text-2xl">{item.icon}</div>
                  <h4 className="mt-4 text-lg md:text-xl">{item.title}</h4>
                  <p className="mt-2 text-xs md:text-sm opacity-90 leading-relaxed">{item.desc}</p>
                </motion.div>
              ))}
            </div>

            <div className="mt-12 flex flex-wrap gap-3">
              <Magnetic>
                <a
                  href="https://forms.gle/Px5NuE51UrGZMSKx8"
                  target="_blank"
                  rel="noreferrer"
                  className="group inline-flex items-center gap-2 rounded-full bg-white text-[color:var(--reelio-black)] px-7 py-4 uppercase tracking-[0.2em] text-xs liquid-shine shadow-2xl"
                >
                  Book Reelio Package
                  <motion.span animate={{ x: [0, 4, 0] }} transition={{ duration: 1.6, repeat: Infinity }}>
                    →
                  </motion.span>
                </a>
              </Magnetic>
              <Magnetic>
                <a
                  href="#contact"
                  className="glass rounded-full px-7 py-4 uppercase tracking-[0.2em] text-xs inline-block"
                >
                  Talk to us
                </a>
              </Magnetic>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ============ CTA ============ */}
      <section id="contact" className="relative py-24 md:py-40">
        <div className="mx-auto max-w-5xl px-5 md:px-10 text-center">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-[10px] uppercase tracking-[0.4em] opacity-80"
          >
            Let's roll the reel
          </motion.p>
          <h2 className="mt-6 text-6xl md:text-[8rem] leading-[0.9]">
            <motion.span
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ type: "spring", stiffness: 80 }}
              className="block"
            >
              Ready to grow
            </motion.span>
            <motion.span
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.15, type: "spring", stiffness: 80 }}
              className="block"
            >
              with <span className="text-shimmer">Reelio</span>?
            </motion.span>
          </h2>
          <p className="mt-8 max-w-xl mx-auto text-lg opacity-90">
            Brands looking to grow, or creators looking to join the team — start with a single form.
          </p>

          <div className="mt-12 inline-flex relative">
            <span className="absolute inset-0 rounded-full animate-pulse-ring" />
            <Magnetic strength={0.5}>
              <a
                href="https://forms.gle/Px5NuE51UrGZMSKx8"
                target="_blank"
                rel="noreferrer"
                className="relative inline-flex items-center gap-3 rounded-full bg-white text-[color:var(--reelio-black)] px-10 py-5 uppercase tracking-[0.25em] text-sm liquid-shine shadow-2xl"
              >
                Fill the Form
                <motion.span animate={{ x: [0, 6, 0] }} transition={{ duration: 1.6, repeat: Infinity }} className="text-xl">
                  →
                </motion.span>
              </a>
            </Magnetic>
          </div>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="relative border-t border-white/15 glass-dark">
        <div className="mx-auto max-w-7xl px-5 md:px-10 py-8 flex flex-wrap items-center justify-between gap-4 text-xs uppercase tracking-[0.25em]">
          <div className="flex items-center gap-3">
            <img src={logoAsset.url} alt="Reelio" className="h-7 w-7 rounded object-cover" />
            <span>Reelio SMMA</span>
          </div>
          <div className="opacity-80">© {new Date().getFullYear()} Reelio. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
