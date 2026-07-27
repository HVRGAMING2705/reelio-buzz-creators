import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import logoAsset from "@/assets/reelio-logo.jpeg.asset.json";
import { useReveal } from "@/hooks/use-reveal";

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

function Index() {
  useReveal();
  const [scrolled, setScrolled] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const [mouse, setMouse] = useState({ x: 0.5, y: 0.5 });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setMouse({ x: e.clientX / w, y: e.clientY / h });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <div className="relative min-h-screen bg-background text-foreground overflow-hidden">
      {/* ============ ANIMATED BACKGROUND ============ */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div
          className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full blur-3xl opacity-70 animate-blob"
          style={{ background: "radial-gradient(circle, oklch(0.75 0.22 30) 0%, transparent 70%)" }}
        />
        <div
          className="absolute top-1/3 -right-40 h-[600px] w-[600px] rounded-full blur-3xl opacity-60 animate-blob-slow"
          style={{ background: "radial-gradient(circle, oklch(0.35 0.12 15) 0%, transparent 70%)" }}
        />
        <div
          className="absolute bottom-0 left-1/3 h-[500px] w-[500px] rounded-full blur-3xl opacity-50 animate-blob"
          style={{ background: "radial-gradient(circle, oklch(0.9 0.15 45) 0%, transparent 70%)", animationDelay: "-8s" }}
        />
        {/* noise/grain */}
        <div
          className="absolute inset-0 opacity-[0.06] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
          }}
        />
      </div>

      {/* ============ NAV ============ */}
      <header
        className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 transition-all duration-500 ${
          scrolled ? "w-[94%] max-w-5xl" : "w-[96%] max-w-6xl"
        }`}
      >
        <div className="glass rounded-full px-4 md:px-6 h-14 flex items-center justify-between">
          <a href="#top" className="flex items-center gap-2.5">
            <img src={logoAsset.url} alt="Reelio" className="h-8 w-8 rounded-lg object-cover ring-1 ring-white/40" />
            <span className="text-xl tracking-wide">REELIO</span>
          </a>
          <nav className="hidden md:flex items-center gap-7 text-xs uppercase tracking-[0.25em]">
            <a href="#services" className="hover:opacity-70 transition">Services</a>
            <a href="#niches" className="hover:opacity-70 transition">Niches</a>
            <a href="#package" className="hover:opacity-70 transition">Package</a>
          </nav>
          <a
            href="https://forms.gle/Px5NuE51UrGZMSKx8"
            target="_blank"
            rel="noreferrer"
            className="glass-chip rounded-full px-4 py-1.5 text-xs uppercase tracking-[0.2em] liquid-shine hover:scale-[1.03] transition"
          >
            Get in touch
          </a>
        </div>
      </header>

      {/* ============ HERO ============ */}
      <section id="top" ref={heroRef} className="relative pt-36 pb-28 md:pt-48 md:pb-40">
        <div className="mx-auto max-w-7xl px-5 md:px-10">
          <div
            className="inline-flex items-center gap-2 glass-chip rounded-full px-4 py-1.5 text-[10px] uppercase tracking-[0.3em] animate-rise"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
            </span>
            Now booking for 2026
          </div>

          <h1
            className="mt-8 text-[19vw] md:text-[9.5vw] leading-[0.88] font-normal animate-rise"
            style={{ animationDelay: "0.1s" }}
          >
            <span className="block text-shimmer">REELS.</span>
            <span className="block text-shimmer" style={{ animationDelay: "-2s" }}>BRANDS.</span>
            <span
              className="block"
              style={{
                transform: `translate(${(mouse.x - 0.5) * 10}px, ${(mouse.y - 0.5) * 6}px)`,
                transition: "transform 0.6s ease-out",
              }}
            >
              GROWTH.
            </span>
          </h1>

          <div className="mt-12 md:mt-16 grid md:grid-cols-2 gap-8 items-end animate-rise" style={{ animationDelay: "0.25s" }}>
            <p className="text-lg md:text-2xl max-w-xl opacity-95 text-balance">
              Reelio builds the content, shoots the story, runs the ads, and grows the brand — all under one reel.
            </p>
            <div className="flex flex-wrap gap-3 md:justify-end">
              <a
                href="https://forms.gle/Px5NuE51UrGZMSKx8"
                target="_blank"
                rel="noreferrer"
                className="group relative inline-flex items-center gap-2 rounded-full bg-white text-[color:var(--reelio-black)] px-6 py-3.5 uppercase tracking-[0.2em] text-xs liquid-shine hover:scale-[1.03] transition shadow-2xl"
              >
                Start a Project
                <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
              </a>
              <a
                href="#services"
                className="glass rounded-full px-6 py-3.5 uppercase tracking-[0.2em] text-xs hover:scale-[1.03] transition"
              >
                Explore
              </a>
            </div>
          </div>

          {/* Floating stat cards */}
          <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {[
              { k: "50+", v: "Brands scaled" },
              { k: "10M+", v: "Reels views" },
              { k: "24/7", v: "Content engine" },
              { k: "6", v: "Core services" },
            ].map((s, i) => (
              <div
                key={s.v}
                className="glass rounded-2xl p-5 md:p-6 animate-drift reveal"
                style={{ animationDelay: `${i * 0.4}s` }}
              >
                <div className="text-3xl md:text-4xl">{s.k}</div>
                <div className="mt-1 text-[10px] md:text-xs uppercase tracking-[0.2em] opacity-80">{s.v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ MARQUEE ============ */}
      <section className="relative py-6 border-y border-white/15 overflow-hidden glass-dark">
        <div className="flex whitespace-nowrap animate-marquee gap-12 text-lg md:text-2xl uppercase tracking-[0.3em] opacity-90">
          {[...marqueeItems, ...marqueeItems].map((it, i) => (
            <span key={i} className="flex items-center gap-12">
              {it}
              <span className="opacity-60">✦</span>
            </span>
          ))}
        </div>
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
            <article
              key={s.title}
              className="reveal glass liquid-shine group relative rounded-3xl p-7 md:p-8 hover:-translate-y-1 transition-transform duration-500"
              style={{ transitionDelay: `${i * 40}ms` }}
            >
              <div className="flex items-center justify-between">
                <div className="text-4xl">{s.icon}</div>
                <div className="glass-chip rounded-full h-8 w-8 grid place-items-center text-xs opacity-90">
                  0{i + 1}
                </div>
              </div>
              <h3 className="mt-10 text-3xl md:text-4xl">{s.title}</h3>
              <p className="mt-3 opacity-90 leading-relaxed">{s.desc}</p>
              <div className="mt-8 flex items-center gap-2 text-xs uppercase tracking-[0.2em] opacity-90">
                Learn more
                <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
              </div>
            </article>
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

          <div className="mt-10 flex flex-wrap gap-3 reveal">
            {["Startups", "Fashion", "Cafés", "Fitness", "Events"].map((n) => (
              <span
                key={n}
                className="glass-chip rounded-full px-5 py-2 uppercase tracking-[0.25em] text-xs liquid-shine hover:scale-[1.05] transition cursor-default"
              >
                {n}
              </span>
            ))}
          </div>

          <div className="mt-14 grid md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {niches.map((n, i) => (
              <article
                key={n.title}
                className="reveal glass rounded-3xl p-7 md:p-8 hover:-translate-y-1 transition-transform duration-500"
                style={{ transitionDelay: `${i * 60}ms` }}
              >
                <div className="text-4xl animate-drift" style={{ animationDelay: `${i * 0.5}s` }}>{n.emoji}</div>
                <h3 className="mt-8 text-2xl md:text-3xl">{n.title}</h3>
                <p className="mt-3 opacity-90">{n.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ============ PACKAGE ============ */}
      <section id="package" className="relative mx-auto max-w-7xl px-5 md:px-10 py-24 md:py-36">
        <div className="reveal glass rounded-[2.5rem] p-6 md:p-14 relative overflow-hidden">
          <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full blur-3xl opacity-60 animate-blob"
               style={{ background: "radial-gradient(circle, oklch(1 0 0 / 0.4), transparent 70%)" }} />
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
                <div
                  key={item.title}
                  className="glass-chip rounded-2xl p-5 hover:-translate-y-1 transition-transform duration-500 reveal"
                  style={{ transitionDelay: `${i * 40}ms` }}
                >
                  <div className="text-2xl">{item.icon}</div>
                  <h4 className="mt-4 text-lg md:text-xl">{item.title}</h4>
                  <p className="mt-2 text-xs md:text-sm opacity-90 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-12 flex flex-wrap gap-3">
              <a
                href="https://forms.gle/Px5NuE51UrGZMSKx8"
                target="_blank"
                rel="noreferrer"
                className="group inline-flex items-center gap-2 rounded-full bg-white text-[color:var(--reelio-black)] px-7 py-4 uppercase tracking-[0.2em] text-xs liquid-shine hover:scale-[1.03] transition shadow-2xl"
              >
                Book Reelio Package
                <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
              </a>
              <a
                href="#contact"
                className="glass rounded-full px-7 py-4 uppercase tracking-[0.2em] text-xs hover:scale-[1.03] transition"
              >
                Talk to us
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ============ CTA ============ */}
      <section id="contact" className="relative py-24 md:py-40">
        <div className="mx-auto max-w-5xl px-5 md:px-10 text-center reveal">
          <p className="text-[10px] uppercase tracking-[0.4em] opacity-80">Let's roll the reel</p>
          <h2 className="mt-6 text-6xl md:text-[8rem] leading-[0.9]">
            Ready to grow<br />
            with <span className="text-shimmer">Reelio</span>?
          </h2>
          <p className="mt-8 max-w-xl mx-auto text-lg opacity-90">
            Brands looking to grow, or creators looking to join the team — start with a single form.
          </p>

          <div className="mt-12 inline-flex relative">
            <span className="absolute inset-0 rounded-full animate-pulse-ring" />
            <a
              href="https://forms.gle/Px5NuE51UrGZMSKx8"
              target="_blank"
              rel="noreferrer"
              className="relative inline-flex items-center gap-3 rounded-full bg-white text-[color:var(--reelio-black)] px-10 py-5 uppercase tracking-[0.25em] text-sm liquid-shine hover:scale-[1.05] transition shadow-2xl"
            >
              Fill the Form
              <span className="text-xl">→</span>
            </a>
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
