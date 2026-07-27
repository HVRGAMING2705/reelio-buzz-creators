import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, useScroll, useSpring } from "motion/react";
import logoMark from "@/assets/reelio-logo-mark.png.asset.json";
import { useReveal } from "@/hooks/use-reveal";
import { BookingModal } from "@/components/booking-modal";
import { supabase } from "@/integrations/supabase/client";
import { trackClick, trackFormSubmit, trackEvent } from "@/lib/analytics";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Reelio SMMA — A Cinematic Social Media Studio for Brands" },
      {
        name: "description",
        content:
          "Reelio is a cinematic social media agency. Reels, photo/video shoots, editing, Meta ads, outreach and creator growth — one crew, monthly retainer from ₹10K.",
      },
      { name: "keywords", content: "social media agency, SMMA, reels, content creation, Meta ads, influencer outreach, video production India, Reelio" },
      { property: "og:title", content: "Reelio SMMA — A Cinematic Social Media Studio" },
      {
        property: "og:description",
        content:
          "Content, shoots, editing, ads and outreach — one crew shipping weekly. Monthly plans from ₹10K.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/" },
      { property: "og:site_name", content: "Reelio SMMA" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Reelio SMMA — A Cinematic Social Media Studio" },
      {
        name: "twitter:description",
        content: "Reels, shoots, editing, ads and outreach — one crew shipping weekly.",
      },
    ],
    links: [
      { rel: "canonical", href: "/" },
      { rel: "preload", as: "image", href: logoMark.url, fetchpriority: "high" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Reelio SMMA",
          description:
            "Cinematic social media agency delivering content, shoots, editing, ads and creator outreach.",
          url: "/",
          logo: "/favicon.png",
          areaServed: "IN",
          sameAs: [],
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Service",
          serviceType: "Social Media Marketing Agency",
          provider: { "@type": "Organization", name: "Reelio SMMA" },
          areaServed: "IN",
          offers: {
            "@type": "AggregateOffer",
            priceCurrency: "INR",
            lowPrice: "10000",
            highPrice: "50000",
            offerCount: "2",
          },
        }),
      },
    ],
  }),
  component: Index,
});


const services = [
  {
    n: "01",
    title: "Content Creation",
    kicker: "Reels · Posts · Stories",
    desc:
      "Platform-native reels and posts built for hook, retention and share. We ship weekly at studio pace.",
  },
  {
    n: "02",
    title: "Photo & Video",
    kicker: "Brand · Product · Event",
    desc:
      "Cinematic shoots with a full crew — camera, light, sound, direction — turning your story into footage worth cutting.",
  },
  {
    n: "03",
    title: "Editing & Design",
    kicker: "Reels · Thumbs · Creatives",
    desc:
      "Every frame graded, every cut earned. Post, motion and brand design produced under one roof.",
  },
  {
    n: "04",
    title: "Digital Marketing",
    kicker: "Meta Ads · Strategy",
    desc:
      "Full-funnel Meta ads, weekly content plans, and a growth model tuned to your category — not a dashboard template.",
  },
  {
    n: "05",
    title: "Outreach & Growth",
    kicker: "Creators · Collabs",
    desc:
      "Influencer outreach, creator collabs and community moves that pull real audiences toward your brand.",
  },
  {
    n: "06",
    title: "Models & Talent",
    kicker: "Casting · Direction",
    desc:
      "Cast the right face for the right frame. Talent scouting, direction and on-set management, handled.",
  },
];

const niches = [
  "New Startups",
  "Fashion Brands",
  "Cafés & Food",
  "Gyms & Fitness",
  "Event Marketing",
  "Creators",
];

const marqueeItems = [
  "Reels", "Photography", "Videography", "Editing", "Graphic Design",
  "Meta Ads", "Outreach", "Casting", "Strategy", "Direction",
];

const packageIncludes = [
  { title: "Daily content", desc: "Posts + reels shipped on the weekly board." },
  { title: "10–14 stories / week", desc: "On-brand, on-loop, made for the scroll." },
  { title: "1–3 Meta ads / week", desc: "Setup, targeting, and hands-on management." },
  { title: "1–5 highlight sets", desc: "Curated covers, structured story sets." },
  { title: "On-site shoots", desc: "Videographer + photographer. Models on request." },
  { title: "Editing & graphics", desc: "Reels, posts, thumbnails, campaign creatives." },
  { title: "Strategy & growth", desc: "Weekly optimization tied to a real target." },
  { title: "Outreach support", desc: "Brand and creator outreach in the loop." },
];

const GOOGLE_FORM_URL = "https://forms.gle/Px5NuE51UrGZMSKx8";

type ContactStatus =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<{ name?: string; email?: string; message?: string }>({});
  const [status, setStatus] = useState<ContactStatus>({ kind: "idle" });

  const validate = () => {
    const next: typeof errors = {};
    const n = name.trim();
    const e = email.trim();
    const m = message.trim();
    if (n.length < 2) next.name = "Please enter your name (2+ chars).";
    else if (n.length > 80) next.name = "Name is too long.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) next.email = "Enter a valid email address.";
    if (m.length < 10) next.message = "Tell us a bit more (10+ chars).";
    else if (m.length > 1000) next.message = "Keep it under 1000 characters.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    if (!validate()) {
      setStatus({ kind: "error", message: "Please fix the highlighted fields." });
      trackEvent("form_submit_error", { form: "contact", reason: "validation" });
      return;
    }
    setStatus({ kind: "submitting" });
    try {
      const win = window.open(GOOGLE_FORM_URL, "_blank", "noopener,noreferrer");
      if (!win) throw new Error("Popup blocked. Please allow popups or use the direct link below.");
      trackFormSubmit("contact", { destination: "google_form" });
      setStatus({ kind: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong. Try the direct link below.";
      setStatus({ kind: "error", message });
      trackEvent("form_submit_error", { form: "contact", reason: "popup_blocked" });
    }
  };

  if (status.kind === "success") {
    return (
      <div className="liquid-glass p-8 md:p-10 rounded-2xl">
        <div className="font-body text-[10px] uppercase tracking-[0.3em] text-[color:var(--reelio-red)]">
          Sent · Awaiting form
        </div>
        <h3 className="mt-4 font-display text-3xl md:text-4xl leading-tight">
          Thanks, {name.split(" ")[0] || "friend"}.
        </h3>
        <p className="mt-4 font-body text-white/70">
          We opened the intake form in a new tab. Finish there and we'll be in touch within 24 hours (weekdays).
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a href={GOOGLE_FORM_URL} target="_blank" rel="noreferrer" className="btn-red">
            Reopen the form
          </a>
          <button
            type="button"
            onClick={() => {
              setName(""); setEmail(""); setMessage("");
              setErrors({}); setStatus({ kind: "idle" });
            }}
            className="btn-ghost"
          >
            Send another
          </button>
        </div>
      </div>
    );
  }

  const submitting = status.kind === "submitting";

  return (
    <form onSubmit={onSubmit} noValidate className="liquid-glass p-6 md:p-8 rounded-2xl">
      <div className="font-body text-[10px] uppercase tracking-[0.3em] text-white/50">
        § Contact desk
      </div>
      <h3 className="mt-3 font-display text-2xl md:text-3xl leading-tight">
        Start the conversation.
      </h3>
      <p className="mt-2 font-body text-sm text-white/60">
        Fill this in — we'll hand you the intake form to finish the details.
      </p>

      <div className="mt-6 space-y-4">
        <div>
          <label htmlFor="cf-name" className="block font-body text-[11px] uppercase tracking-[0.25em] text-white/50 mb-2">
            Name
          </label>
          <input
            id="cf-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            autoComplete="name"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "cf-name-err" : undefined}
            className="input-glass w-full"
            placeholder="Your full name"
          />
          {errors.name && (
            <p id="cf-name-err" className="mt-1.5 text-xs text-[color:var(--reelio-red)]">
              {errors.name}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="cf-email" className="block font-body text-[11px] uppercase tracking-[0.25em] text-white/50 mb-2">
            Email
          </label>
          <input
            id="cf-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={120}
            autoComplete="email"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "cf-email-err" : undefined}
            className="input-glass w-full"
            placeholder="you@brand.com"
          />
          {errors.email && (
            <p id="cf-email-err" className="mt-1.5 text-xs text-[color:var(--reelio-red)]">
              {errors.email}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="cf-msg" className="block font-body text-[11px] uppercase tracking-[0.25em] text-white/50 mb-2">
            What are you building?
          </label>
          <textarea
            id="cf-msg"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={1000}
            rows={4}
            aria-invalid={!!errors.message}
            aria-describedby={errors.message ? "cf-msg-err" : "cf-msg-count"}
            className="input-glass w-full resize-none"
            placeholder="Niche, goals, timelines…"
          />
          <div className="mt-1.5 flex items-center justify-between">
            {errors.message ? (
              <p id="cf-msg-err" className="text-xs text-[color:var(--reelio-red)]">
                {errors.message}
              </p>
            ) : (
              <span id="cf-msg-count" className="text-[11px] text-white/40">
                {message.length}/1000
              </span>
            )}
          </div>
        </div>
      </div>

      {status.kind === "error" && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-[color:var(--reelio-red)]/40 bg-[color:var(--reelio-red)]/10 px-3 py-2 text-sm text-white/90"
        >
          {status.message}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={submitting} className="btn-red disabled:opacity-60">
          {submitting ? "Opening form…" : "Continue to form"}
        </button>
        <a href={GOOGLE_FORM_URL} target="_blank" rel="noreferrer" className="btn-ghost">
          Open form directly
        </a>
      </div>
      <p className="mt-3 text-[11px] text-white/40">
        We use Google Forms for intake. Your responses go straight to the Reelio inbox.
      </p>
    </form>
  );
}

function Index() {
  useReveal();

  const [scrolled, setScrolled] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [user, setUser] = useState<{ email?: string; avatar_url?: string | null } | null>(null);

  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 100, damping: 20, restDelta: 0.001 });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(
        data.user
          ? { email: data.user.email, avatar_url: data.user.user_metadata?.avatar_url }
          : null,
      );
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(
        session?.user
          ? { email: session.user.email, avatar_url: session.user.user_metadata?.avatar_url }
          : null,
      );
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const year = new Date().getFullYear();
  const issue = String(year).slice(-2);

  return (
    <div className="relative min-h-screen bg-background text-foreground overflow-hidden">
      <a href="#main" className="skip-link">Skip to content</a>
      <BookingModal open={bookingOpen} onClose={() => setBookingOpen(false)} />

      {/* ============ AMBIENT LIQUID BACKDROP ============ */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="glow-orb animate-float-orb"
             style={{ width: 520, height: 520, top: '-8%', left: '-6%',
                      background: 'radial-gradient(circle, oklch(0.58 0.22 27 / 0.55), transparent 60%)' }} />
        <div className="glow-orb animate-float-orb-alt"
             style={{ width: 620, height: 620, top: '40%', right: '-10%',
                      background: 'radial-gradient(circle, oklch(0.55 0.2 27 / 0.35), transparent 60%)' }} />
        <div className="glow-orb animate-float-orb"
             style={{ width: 400, height: 400, bottom: '-6%', left: '30%', animationDelay: '-6s',
                      background: 'radial-gradient(circle, oklch(0.7 0.18 340 / 0.28), transparent 60%)' }} />
        {/* subtle grid */}
        <div className="absolute inset-0 opacity-[0.05]"
             style={{ backgroundImage:
               'linear-gradient(oklch(1 0 0 / 1) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 1) 1px, transparent 1px)',
               backgroundSize: '80px 80px' }} />
      </div>

      {/* scroll progress */}
      <motion.div
        aria-hidden="true"
        style={{ scaleX: progress, transformOrigin: "0% 50%" }}
        className="fixed top-0 left-0 right-0 h-[2px] bg-[color:var(--reelio-red)] z-[70]"
      />


      {/* ============ NAV ============ */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? "glass-dark border-b border-white/10 shadow-[0_10px_40px_-20px_oklch(0_0_0/0.6)]"
            : "bg-transparent"
        }`}
      >

        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 md:px-8 lg:px-10 h-16 md:h-20 lg:h-24 grid grid-cols-[minmax(0,auto)_1fr_auto] md:flex items-center md:justify-between gap-4 md:gap-6 lg:gap-10">
          <a href="#top" aria-label="Reelio — back to top" className="flex items-center shrink-0 -my-3 md:-my-6 lg:-my-7">
            <img
              src={logoMark.url}
              alt=""
              width={320}
              height={96}
              decoding="async"
              fetchPriority="high"
              className="h-12 md:h-16 lg:h-20 w-auto object-contain block"
            />
          </a>
          <nav aria-label="Primary" className="hidden md:flex items-center gap-8 lg:gap-12 text-[11px] lg:text-[12px] tracking-[0.28em] uppercase font-body font-medium">
            <a href="#services" className="hover:text-[color:var(--reelio-red)] transition-colors">Services</a>
            <a href="#niches" className="hover:text-[color:var(--reelio-red)] transition-colors">Niches</a>
            <a href="#package" className="hover:text-[color:var(--reelio-red)] transition-colors">Package</a>
            <a href="#contact" className="hover:text-[color:var(--reelio-red)] transition-colors">Contact</a>
          </nav>
          <div className="flex items-center gap-3">
            {user ? (
              <Link
                to="/admin"
                className="hidden sm:inline-flex items-center gap-2 text-[10px] tracking-[0.25em] uppercase font-body font-semibold hover:text-[color:var(--reelio-red)]"
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10 overflow-hidden text-[10px]">
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt="" loading="lazy" decoding="async" width={24} height={24} className="h-full w-full object-cover" />
                  ) : (
                    user.email?.[0]?.toUpperCase() ?? "U"
                  )}
                </span>
                Studio
              </Link>
            ) : (
              <Link
                to="/auth"
                className="hidden sm:inline-flex text-[10px] tracking-[0.25em] uppercase font-body font-semibold hover:text-[color:var(--reelio-red)]"
              >
                Sign in
              </Link>
            )}
            <button
              type="button"
              onClick={() => { trackClick("open_booking_modal"); setBookingOpen(true); }}
              className="btn-red !py-2.5 !px-4 md:!px-5 !text-[10px]"
            >
              Book a call
            </button>
          </div>
        </div>
      </header>

      <main id="main">
      {/* ============ MASTHEAD / HERO ============ */}
      <section id="top" aria-label="Introduction" className="relative pt-28 md:pt-36 lg:pt-44 pb-16 md:pb-24 lg:pb-32">
        <div className="mx-auto max-w-[1600px] px-5 sm:px-8 md:px-10 lg:px-14">
          {/* issue bar */}
          <div className="flex items-end justify-between gap-4 pb-6 border-b border-white/15">
            <div className="flex items-baseline gap-6">
              <span className="font-display text-xs md:text-sm tracking-[0.3em] text-[color:var(--reelio-red)]">
                REELIO — ISSUE №{issue}
              </span>
              <span className="hidden md:inline font-body text-xs uppercase tracking-[0.28em] text-white/50">
                Vol. 01 · {year}
              </span>
            </div>
            <span className="font-body text-[10px] md:text-xs uppercase tracking-[0.28em] text-white/50">
              A Cinematic Social Studio
            </span>
          </div>

          {/* Masthead headline — magazine grid */}
          <div className="grid md:grid-cols-12 gap-6 md:gap-8 pt-10 md:pt-16">
            <div className="md:col-span-9">
              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, ease: [0.2, 0.7, 0.2, 1] }}
                className="font-display text-[15vw] md:text-[10.5vw] xl:text-[9vw] 2xl:text-[150px] leading-[0.86] tracking-[-0.02em]"
              >
                <span className="block">STORIES</span>
                <span className="block">
                  <span className="text-shimmer">SHOT.</span>{" "}
                  <span className="italic font-body font-light lowercase text-white/70 text-[10vw] md:text-[6.5vw] xl:text-[5.5vw] 2xl:text-[92px]">
                    cut,
                  </span>
                </span>
                <span className="block">SHIPPED.</span>
              </motion.h1>
            </div>
            <div className="md:col-span-3 flex flex-col justify-end">
              <span className="slug mb-3">The Lede</span>
              <p className="font-body text-base md:text-[17px] leading-relaxed text-white/80">
                Reelio is a social media studio for brands that refuse to look
                like everyone else. We shoot the story, cut the reel, run the
                ads, and grow the room — as one crew.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button type="button" onClick={() => { trackClick("open_booking_modal"); setBookingOpen(true); }} className="btn-red">
                  Book a call
                </button>
                <a href="#services" className="btn-ghost">See the work</a>
              </div>
            </div>
          </div>

          {/* Byline strip */}
          <div className="mt-16 md:mt-24 grid grid-cols-2 sm:grid-cols-4 gap-4 md:gap-6 pt-8 border-t border-white/15">
            {[
              { k: "50+", v: "Brands scaled" },
              { k: "10M+", v: "Reels views" },
              { k: "6", v: "Core services" },
              { k: "24/7", v: "Content engine" },
            ].map((s, i) => (
              <motion.div
                key={s.v}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.7, delay: i * 0.08, ease: [0.2, 0.7, 0.2, 1] }}
                whileHover={{ y: -4 }}
                className="liquid-glass p-5 md:p-6"
              >
                <div className="font-display text-4xl md:text-6xl lg:text-7xl text-white leading-none">{s.k}</div>
                <div className="mt-2 font-body text-[10px] md:text-xs uppercase tracking-[0.28em] text-white/60">
                  {s.v}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ MARQUEE / TICKER ============ */}
      <section aria-hidden="true" className="relative py-4 md:py-5 border-y border-white/15 bg-[color:var(--reelio-red)] overflow-hidden liquid-shine">

        <div className="flex whitespace-nowrap animate-marquee font-display text-xl md:text-3xl tracking-[-0.01em]">
          {[...marqueeItems, ...marqueeItems, ...marqueeItems].map((it, i) => (
            <span key={i} className="flex items-center gap-8 md:gap-12 pr-8 md:pr-12 text-white">
              {it}
              <span className="text-white/60">✦</span>
            </span>
          ))}
        </div>
      </section>

      {/* ============ SERVICES — CASE INDEX ============ */}
      <section id="services" className="relative py-24 md:py-32 lg:py-40">
        <div className="mx-auto max-w-[1600px] px-5 sm:px-8 md:px-10 lg:px-14">
          <div className="grid md:grid-cols-12 gap-6 md:gap-8 pb-10 md:pb-16 border-b border-white/15">
            <div className="md:col-span-5 lg:col-span-4">
              <span className="slug">§ Services</span>
              <h2 className="mt-6 font-display text-5xl md:text-7xl lg:text-8xl leading-[0.9]">
                The<br />
                <span className="text-[color:var(--reelio-red)]">Index.</span>
              </h2>
            </div>
            <div className="md:col-span-6 md:col-start-7 flex items-end">
              <p className="font-body text-lg lg:text-xl text-white/70 max-w-md">
                Six departments. One crew. Every service below is built and
                delivered in-house — no agency-of-agencies, no handoffs.
              </p>
            </div>
          </div>

          <ul className="divide-y divide-white/15 border-b border-white/15">
            {services.map((s) => (
              <li key={s.n} className="case-row group">
                <a
                  href="#contact"
                  className="grid grid-cols-12 items-center gap-4 md:gap-8 py-6 md:py-10 lg:py-12 px-2 md:px-4 transition-colors"
                >
                  <span className="col-span-2 md:col-span-1 font-display text-2xl md:text-4xl lg:text-5xl text-white/40 group-hover:text-white transition-colors">
                    {s.n}
                  </span>
                  <span className="col-span-10 md:col-span-5 font-display text-3xl md:text-6xl lg:text-7xl leading-none group-hover:text-white transition-colors">
                    {s.title}
                  </span>
                  <span className="hidden sm:block col-span-6 md:col-span-3 font-body text-[11px] lg:text-xs uppercase tracking-[0.25em] text-white/50 group-hover:text-white/90 transition-colors">
                    {s.kicker}
                  </span>
                  <span className="col-span-12 sm:col-span-6 md:col-span-3 font-body text-sm lg:text-[15px] text-white/60 group-hover:text-white/90 transition-colors">
                    {s.desc}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ============ NICHES — EDITORIAL SPREAD ============ */}
      <section id="niches" className="relative py-24 md:py-32 lg:py-40 bg-[color:var(--reelio-red)] text-white">
        <div className="mx-auto max-w-[1600px] px-5 sm:px-8 md:px-10 lg:px-14">
          <div className="grid md:grid-cols-12 gap-6 md:gap-8">
            <div className="md:col-span-5">
              <span className="font-body text-[10px] uppercase tracking-[0.3em] font-semibold text-white/80">
                § Feature
              </span>
              <h2 className="mt-4 font-display text-6xl md:text-[8vw] xl:text-[7vw] 2xl:text-[120px] leading-[0.9]">
                Who we<br />shoot for.
              </h2>
            </div>
            <div className="md:col-span-6 md:col-start-7 flex flex-col justify-end">
              <p className="font-body text-lg md:text-xl lg:text-2xl leading-relaxed text-white/90 max-w-lg">
                We work with brands that treat social as a stage — not a
                checkbox. If you have a room to fill, a product to move, or a
                story that hasn't been told properly, you're on the list.
              </p>
            </div>
          </div>

          <ul className="mt-16 md:mt-24 divide-y divide-white/25 border-y border-white/25">
            {niches.map((n, i) => (
              <li
                key={n}
                className="flex items-baseline justify-between py-6 md:py-10 lg:py-12 font-display text-4xl md:text-7xl lg:text-8xl uppercase tracking-[-0.01em] hover:pl-4 transition-all duration-500"
              >
                <span className="flex items-baseline gap-6">
                  <span className="font-body text-xs md:text-sm text-white/60 tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {n}
                </span>
                <span className="font-body text-xs uppercase tracking-[0.3em] text-white/70">
                  Booking
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ============ PACKAGE / PRICING SPREAD ============ */}
      <section id="package" className="relative py-24 md:py-32 lg:py-40">
        <div className="mx-auto max-w-[1600px] px-5 sm:px-8 md:px-10 lg:px-14">
          <div className="grid md:grid-cols-12 gap-8 md:gap-12 lg:gap-16">
            {/* left column — the "cover" */}
            <div className="md:col-span-5 md:sticky md:top-28 self-start">
              <span className="slug">§ The Package</span>
              <h2 className="mt-6 font-display text-6xl md:text-8xl lg:text-9xl leading-[0.88]">
                Reelio<br />
                <span className="text-[color:var(--reelio-red)]">Monthly.</span>
              </h2>
              <div className="mt-10 flex items-baseline gap-3">
                <span className="font-display text-6xl md:text-8xl lg:text-9xl leading-none">₹50K</span>
                <span className="font-body text-sm uppercase tracking-[0.25em] text-white/50">
                  / month
                </span>
              </div>
              <p className="mt-4 font-body text-white/60">
                Or <span className="text-white">₹10,000</span> — starter plan for
                launching brands. One rate. No performance fees.
              </p>

              <div className="mt-10 flex flex-wrap gap-3">
                <button type="button" onClick={() => { trackClick("open_booking_modal"); setBookingOpen(true); }} className="btn-red">
                  Start the intake
                </button>
                <a href="#contact" className="btn-ghost">Ask a question</a>
              </div>

              <div className="mt-10 pt-6 border-t border-white/15">
                <p className="font-body text-xs uppercase tracking-[0.25em] text-white/40">
                  Onboarding in 48h · One dedicated crew · Monthly billing
                </p>
              </div>
            </div>

            {/* right column — includes */}
            <div className="md:col-span-7">
              <div className="rule-line mb-8" />
              <span className="slug">Included</span>
              <ul className="mt-8 grid sm:grid-cols-2 gap-4 lg:gap-5">
                {packageIncludes.map((it, i) => (
                  <motion.li
                    key={it.title}
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-60px" }}
                    transition={{ duration: 0.55, delay: i * 0.05, ease: [0.2, 0.7, 0.2, 1] }}
                    whileHover={{ y: -4, scale: 1.01 }}
                    className="liquid-glass flex gap-4 p-5"
                  >
                    <span className="font-display text-2xl text-[color:var(--reelio-red)] tabular-nums pt-1">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h3 className="font-display text-xl md:text-2xl leading-tight">
                        {it.title}
                      </h3>
                      <p className="mt-2 font-body text-sm text-white/70 leading-relaxed">
                        {it.desc}
                      </p>
                    </div>
                  </motion.li>
                ))}
              </ul>

            </div>
          </div>
        </div>
      </section>

      {/* ============ CONTACT / CTA ============ */}
      <section id="contact" className="relative py-24 md:py-32 lg:py-40 border-t border-white/15">
        <div className="mx-auto max-w-[1600px] px-5 sm:px-8 md:px-10 lg:px-14">
          <div className="grid md:grid-cols-12 gap-8 lg:gap-12">
            <div className="md:col-span-7">
              <span className="slug">§ End Sheet</span>
              <h2 className="mt-6 font-display text-6xl md:text-[10vw] xl:text-[8.5vw] 2xl:text-[150px] leading-[0.88]">
                Roll the<br />
                <span className="text-[color:var(--reelio-red)]">next reel.</span>
              </h2>
              <p className="mt-8 font-body text-lg md:text-xl lg:text-2xl text-white/70 max-w-2xl">
                Twenty minutes on a call. We'll walk you through the crew, the
                pipeline, and what your first month at Reelio actually looks
                like.
              </p>
              <div className="mt-10 flex flex-wrap gap-3">
                <button type="button" onClick={() => { trackClick("open_booking_modal"); setBookingOpen(true); }} className="btn-red">
                  Book the call
                </button>
                <a href="#contact-form" className="btn-ghost">Send a message</a>
              </div>
              <div className="mt-12 grid grid-cols-2 gap-6 max-w-xl">
                <div>
                  <span className="font-body text-[10px] uppercase tracking-[0.3em] text-white/40">Studio</span>
                  <p className="mt-2 font-body text-white/80">Available across India · Remote worldwide</p>
                </div>
                <div>
                  <span className="font-body text-[10px] uppercase tracking-[0.3em] text-white/40">Response</span>
                  <p className="mt-2 font-body text-white/80">Within 24 hours, weekdays</p>
                </div>
              </div>
            </div>
            <div id="contact-form" className="md:col-span-5">
              <ContactForm />
            </div>
          </div>
        </div>
      </section>
      </main>

      {/* ============ COLOPHON / FOOTER ============ */}
      <footer className="border-t border-white/15 py-10">
        <div className="mx-auto max-w-[1600px] px-5 sm:px-8 md:px-10 lg:px-14 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <img src={logoMark.url} alt="" loading="lazy" decoding="async" width={120} height={40} className="h-5 w-auto object-contain" />
            <span className="font-body text-[10px] uppercase tracking-[0.3em] text-white/70">
              © {year} Reelio Studio · Issue №{issue}
            </span>
          </div>
          <nav aria-label="Footer" className="flex items-center gap-6 font-body text-[10px] uppercase tracking-[0.3em] text-white/70">
            <a href="#services" className="hover:text-white">Services</a>
            <a href="#package" className="hover:text-white">Package</a>
            <a href="#contact" className="hover:text-white">Contact</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
