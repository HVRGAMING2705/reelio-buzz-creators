import { createFileRoute } from "@tanstack/react-router";
import logoAsset from "@/assets/reelio-logo.jpeg.asset.json";

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
  { title: "Content Creation", desc: "High-quality, platform-ready content tailored for Instagram, Reels, and digital campaigns." },
  { title: "Photography & Videography", desc: "Brand shoots, product shoots, events, and cinematic visuals that tell your story." },
  { title: "Video Editing & Graphic Design", desc: "Reels, short-form videos, thumbnails, posters, creatives, and brand assets." },
  { title: "Digital Marketing", desc: "Social media strategy, Meta ads, content planning, and performance optimization." },
  { title: "Outreach & Growth", desc: "Influencer outreach, brand collaborations, lead generation, and community growth." },
  { title: "Models & Creators", desc: "Professional models and content creators for campaigns, shoots, and promotions." },
];

const niches = [
  { title: "New Startups", desc: "Brand identity, launch content, and digital visibility from day one." },
  { title: "Clothing & Fashion Brands", desc: "Campaign shoots, reels, lookbooks, and social media creatives." },
  { title: "Cafés & Food Brands", desc: "Menu shoots, ambience videos, reels, and local audience growth." },
  { title: "Gyms & Fitness Brands", desc: "Transformation videos, trainer content, reels, and performance marketing." },
  { title: "Event Marketing", desc: "Event coverage, promo reels, after-movies, and digital buzz." },
];

const packageIncludes = [
  { icon: "📅", title: "Daily Content", desc: "Posts + Reels created every week following our weekly structure." },
  { icon: "🔥", title: "10–14 Stories / week", desc: "Engaging, on-brand stories to keep your audience hooked." },
  { icon: "📣", title: "1–3 Meta Ads / week", desc: "Full ad setup, targeting, and management." },
  { icon: "⭐", title: "1–5 Highlights / week", desc: "Curated highlight covers and story sets." },
  { icon: "📷", title: "On-Site Shoots", desc: "Dedicated videographer + photographer. Models on request." },
  { icon: "🎞️", title: "Editing & Graphics", desc: "Reels, posts, stories, thumbnails, and all graphic designs included." },
  { icon: "📈", title: "Strategy & Growth", desc: "Content strategy, growth planning, and weekly optimization." },
  { icon: "🤝", title: "Outreach Support", desc: "Brand and creator outreach to accelerate your growth." },
];

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* NAV */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-background/70 border-b border-white/10">
        <div className="mx-auto max-w-7xl px-5 md:px-10 h-16 flex items-center justify-between">
          <a href="#top" className="flex items-center gap-2">
            <img src={logoAsset.url} alt="Reelio" className="h-9 w-9 rounded-md object-cover ring-1 ring-white/20" />
            <span className="text-2xl tracking-wide">REELIO</span>
          </a>
          <nav className="hidden md:flex items-center gap-8 text-sm uppercase tracking-widest">
            <a href="#services" className="hover:opacity-70">Services</a>
            <a href="#niches" className="hover:opacity-70">Niches</a>
            <a href="#package" className="hover:opacity-70">Package</a>
            <a href="#contact" className="hover:opacity-70">Contact</a>
          </nav>
          <a
            href="https://forms.gle/Px5NuE51UrGZMSKx8"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-full bg-white text-[color:var(--reelio-black)] px-4 py-2 text-sm uppercase tracking-widest hover:bg-white/90 transition"
          >
            Join / Hire
          </a>
        </div>
      </header>

      {/* HERO */}
      <section id="top" className="relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-5 md:px-10 pt-16 pb-24 md:pt-28 md:pb-40">
          <p className="text-xs md:text-sm uppercase tracking-[0.4em] opacity-80">Social Media Marketing Agency</p>
          <h1 className="mt-6 text-[18vw] md:text-[10vw] leading-[0.9] font-normal">
            REELS.<br />BRANDS.<br />GROWTH.
          </h1>
          <div className="mt-10 md:mt-14 grid md:grid-cols-2 gap-8 items-end">
            <p className="text-lg md:text-2xl max-w-xl opacity-95 text-balance">
              Reelio builds the content, shoots the story, runs the ads, and grows the brand — all under one reel.
            </p>
            <div className="flex flex-wrap gap-4 md:justify-end">
              <a href="#services" className="inline-flex items-center rounded-full border border-white/60 px-6 py-3 uppercase tracking-widest text-sm hover:bg-white hover:text-[color:var(--reelio-black)] transition">
                Our Services
              </a>
              <a href="https://forms.gle/Px5NuE51UrGZMSKx8" target="_blank" rel="noreferrer" className="inline-flex items-center rounded-full bg-[color:var(--reelio-black)] text-white px-6 py-3 uppercase tracking-widest text-sm hover:opacity-90 transition">
                Start a Project ▶
              </a>
            </div>
          </div>
        </div>
        <div className="absolute -right-24 -bottom-24 opacity-15 pointer-events-none select-none">
          <img src={logoAsset.url} alt="" className="w-[520px] h-[520px] object-cover rounded-3xl" />
        </div>
      </section>

      {/* MARQUEE */}
      <section className="border-y border-white/15 bg-[color:var(--reelio-black)]">
        <div className="mx-auto max-w-7xl px-5 md:px-10 py-6 flex flex-wrap gap-x-10 gap-y-3 text-sm md:text-base uppercase tracking-[0.3em] opacity-90">
          <span>Trend Analysis</span><span>•</span>
          <span>Photo / Video</span><span>•</span>
          <span>Editing</span><span>•</span>
          <span>Graphics</span><span>•</span>
          <span>Digital Marketing</span><span>•</span>
          <span>Outreach</span><span>•</span>
          <span>Models</span>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" className="mx-auto max-w-7xl px-5 md:px-10 py-24 md:py-32">
        <div className="flex items-end justify-between flex-wrap gap-6 mb-14">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] opacity-80">🚀 What We Do</p>
            <h2 className="mt-4 text-6xl md:text-8xl">Our Services</h2>
          </div>
          <p className="max-w-md opacity-90 text-lg">
            End-to-end social media — from the first frame to the final click.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((s, i) => (
            <article
              key={s.title}
              className="group relative overflow-hidden rounded-2xl border border-white/20 p-8 hover:bg-white hover:text-[color:var(--reelio-black)] transition"
            >
              <div className="text-sm opacity-70">0{i + 1}</div>
              <h3 className="mt-8 text-3xl md:text-4xl">{s.title}</h3>
              <p className="mt-4 opacity-90 group-hover:opacity-100">{s.desc}</p>
              <div className="mt-10 text-2xl">→</div>
            </article>
          ))}
        </div>
      </section>

      {/* NICHES */}
      <section id="niches" className="bg-[color:var(--reelio-black)]">
        <div className="mx-auto max-w-7xl px-5 md:px-10 py-24 md:py-32">
          <p className="text-xs uppercase tracking-[0.4em] opacity-80">🎯 Niches</p>
          <h2 className="mt-4 text-6xl md:text-8xl">Who we work with</h2>
          <div className="mt-10 flex flex-wrap gap-3">
            {["Startups", "Fashion", "Cafés", "Fitness", "Events"].map((n) => (
              <span key={n} className="rounded-full border border-white/40 px-5 py-2 uppercase tracking-widest text-sm">
                {n}
              </span>
            ))}
          </div>
          <div className="mt-16 grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {niches.map((n) => (
              <article key={n.title} className="rounded-2xl bg-white/5 border border-white/10 p-8">
                <h3 className="text-2xl md:text-3xl">{n.title}</h3>
                <p className="mt-3 opacity-90">{n.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* PACKAGE */}
      <section id="package" className="mx-auto max-w-7xl px-5 md:px-10 py-24 md:py-32">
        <div className="rounded-3xl border border-white/25 p-8 md:p-14 relative overflow-hidden">
          <p className="text-xs uppercase tracking-[0.4em] opacity-80">💰 Monthly Plan</p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
            <h2 className="text-6xl md:text-8xl">Reelio Package</h2>
            <div className="text-right">
              <div className="text-5xl md:text-6xl">₹50,000</div>
              <div className="uppercase tracking-widest text-sm opacity-80 mt-2">per month · 10,000 reach focus</div>
            </div>
          </div>
          <p className="mt-6 max-w-2xl opacity-90 text-lg">
            Everything a brand needs to stay consistent and grow across Instagram, Facebook, and YouTube.
          </p>
          <div className="mt-12 grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {packageIncludes.map((item) => (
              <div key={item.title} className="rounded-2xl bg-white/10 border border-white/15 p-6">
                <div className="text-2xl">{item.icon}</div>
                <h4 className="mt-4 text-xl">{item.title}</h4>
                <p className="mt-2 text-sm opacity-90">{item.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-12 flex flex-wrap gap-4">
            <a
              href="https://forms.gle/Px5NuE51UrGZMSKx8"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-full bg-white text-[color:var(--reelio-black)] px-7 py-4 uppercase tracking-widest text-sm hover:bg-white/90 transition"
            >
              Book Reelio Package →
            </a>
            <a
              href="#contact"
              className="inline-flex items-center rounded-full border border-white/60 px-7 py-4 uppercase tracking-widest text-sm hover:bg-white hover:text-[color:var(--reelio-black)] transition"
            >
              Talk to us
            </a>
          </div>
        </div>
      </section>

      {/* CTA / CONTACT */}
      <section id="contact" className="bg-[color:var(--reelio-black)]">
        <div className="mx-auto max-w-7xl px-5 md:px-10 py-24 md:py-36 text-center">
          <p className="text-xs uppercase tracking-[0.4em] opacity-80">Let's roll the reel</p>
          <h2 className="mt-6 text-6xl md:text-9xl leading-[0.9]">
            Ready to grow<br />with Reelio?
          </h2>
          <p className="mt-8 max-w-xl mx-auto text-lg opacity-90">
            Whether you're a brand looking to grow or a creator looking to join the team — start with a single form.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <a
              href="https://forms.gle/Px5NuE51UrGZMSKx8"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-full bg-white text-[color:var(--reelio-black)] px-8 py-4 uppercase tracking-widest text-sm hover:bg-white/90 transition"
            >
              Fill the Form →
            </a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/15">
        <div className="mx-auto max-w-7xl px-5 md:px-10 py-10 flex flex-wrap items-center justify-between gap-4 text-sm uppercase tracking-widest">
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
