import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
};

const services = [
  "Full Reelio Package",
  "Content Creation",
  "Photo & Video Shoot",
  "Editing & Design",
  "Meta Ads / Digital Marketing",
  "Outreach & Growth",
  "Models & Creators",
];

const budgets = ["< ₹25k", "₹25k – ₹50k", "₹50k – ₹1L", "₹1L+"];

export function BookingModal({ open, onClose }: Props) {
  const [step, setStep] = useState<"form" | "sent">("form");
  const [form, setForm] = useState({
    name: "",
    brand: "",
    email: "",
    phone: "",
    service: services[0],
    budget: budgets[1],
    niche: "",
    message: "",
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // Persist locally so the builder can wire it to a backend later.
    try {
      const list = JSON.parse(localStorage.getItem("reelio-bookings") || "[]");
      list.push({ ...form, at: new Date().toISOString() });
      localStorage.setItem("reelio-bookings", JSON.stringify(list));
    } catch {}
    setStep("sent");
  };

  const reset = () => {
    setStep("form");
    setForm({
      name: "",
      brand: "",
      email: "",
      phone: "",
      service: services[0],
      budget: budgets[1],
      niche: "",
      message: "",
    });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] grid place-items-center p-4 md:p-8"
        >
          {/* Backdrop */}
          <motion.button
            aria-label="Close booking form"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
          />

          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 140, damping: 20 }}
            className="glass conic-border relative w-full max-w-2xl rounded-[2rem] p-6 md:p-10 max-h-[92vh] overflow-y-auto"
          >
            {/* Floating gradient orbs inside modal */}
            <motion.div
              animate={{ x: [0, 30, -20, 0], y: [0, -20, 15, 0] }}
              transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
              className="pointer-events-none absolute -top-16 -left-16 h-56 w-56 rounded-full blur-3xl opacity-60"
              style={{ background: "radial-gradient(circle, oklch(0.75 0.22 30), transparent 70%)" }}
            />

            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute top-4 right-4 h-9 w-9 rounded-full glass-chip grid place-items-center text-lg z-10"
            >
              ×
            </button>

            {step === "form" ? (
              <>
                <p className="text-[10px] uppercase tracking-[0.4em] opacity-80">📅 Book a call</p>
                <h3 className="mt-3 text-4xl md:text-5xl leading-[0.95]">
                  Let's build your <span className="text-shimmer">reel</span>.
                </h3>
                <p className="mt-3 opacity-90 text-sm md:text-base">
                  Tell us about your brand — we'll get back within 24 hours.
                </p>

                <form onSubmit={submit} className="mt-8 grid gap-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <Field label="Your name" required>
                      <input
                        required
                        value={form.name}
                        onChange={(e) => set("name", e.target.value)}
                        className="input-glass"
                        placeholder="Jane Doe"
                      />
                    </Field>
                    <Field label="Brand / Company">
                      <input
                        value={form.brand}
                        onChange={(e) => set("brand", e.target.value)}
                        className="input-glass"
                        placeholder="Your brand"
                      />
                    </Field>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <Field label="Email" required>
                      <input
                        required
                        type="email"
                        value={form.email}
                        onChange={(e) => set("email", e.target.value)}
                        className="input-glass"
                        placeholder="you@brand.com"
                      />
                    </Field>
                    <Field label="Phone / WhatsApp" required>
                      <input
                        required
                        value={form.phone}
                        onChange={(e) => set("phone", e.target.value)}
                        className="input-glass"
                        placeholder="+91 90000 00000"
                      />
                    </Field>
                  </div>

                  <Field label="Service you're interested in">
                    <div className="flex flex-wrap gap-2">
                      {services.map((s) => (
                        <button
                          type="button"
                          key={s}
                          onClick={() => set("service", s)}
                          className={`glass-chip rounded-full px-4 py-2 text-xs uppercase tracking-[0.15em] transition ${
                            form.service === s ? "bg-white text-[color:var(--reelio-black)]" : ""
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </Field>

                  <Field label="Monthly budget">
                    <div className="flex flex-wrap gap-2">
                      {budgets.map((b) => (
                        <button
                          type="button"
                          key={b}
                          onClick={() => set("budget", b)}
                          className={`glass-chip rounded-full px-4 py-2 text-xs uppercase tracking-[0.15em] transition ${
                            form.budget === b ? "bg-white text-[color:var(--reelio-black)]" : ""
                          }`}
                        >
                          {b}
                        </button>
                      ))}
                    </div>
                  </Field>

                  <Field label="Niche / Industry">
                    <input
                      value={form.niche}
                      onChange={(e) => set("niche", e.target.value)}
                      className="input-glass"
                      placeholder="e.g. Fashion, Café, Fitness…"
                    />
                  </Field>

                  <Field label="Anything we should know?">
                    <textarea
                      value={form.message}
                      onChange={(e) => set("message", e.target.value)}
                      rows={4}
                      className="input-glass resize-none"
                      placeholder="Goals, timelines, references…"
                    />
                  </Field>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-white text-[color:var(--reelio-black)] px-7 py-4 uppercase tracking-[0.2em] text-xs liquid-shine shadow-2xl"
                  >
                    Send booking request →
                  </motion.button>
                </form>
              </>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="py-6 text-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 160, damping: 12 }}
                  className="mx-auto h-20 w-20 rounded-full glass-chip grid place-items-center text-4xl"
                >
                  ✓
                </motion.div>
                <h3 className="mt-6 text-4xl md:text-5xl">You're on the list.</h3>
                <p className="mt-4 opacity-90 max-w-md mx-auto">
                  Thanks {form.name || "there"} — we've got your details. Our team will reach out to{" "}
                  <span className="underline">{form.email}</span> within 24 hours.
                </p>
                <div className="mt-8 flex flex-wrap gap-3 justify-center">
                  <button
                    onClick={reset}
                    className="glass rounded-full px-6 py-3 uppercase tracking-[0.2em] text-xs"
                  >
                    Send another
                  </button>
                  <button
                    onClick={onClose}
                    className="rounded-full bg-white text-[color:var(--reelio-black)] px-6 py-3 uppercase tracking-[0.2em] text-xs"
                  >
                    Close
                  </button>
                </div>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.25em] opacity-80 mb-2">
        {label} {required && <span className="opacity-60">*</span>}
      </span>
      {children}
    </label>
  );
}
