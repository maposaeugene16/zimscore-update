import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight, Sparkles, Wallet, BarChart3, Users, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const steps = [
  { icon: Sparkles,  title: "Welcome to ZimScore",      body: "Let's take a quick 30-second tour of your new financial cockpit." },
  { icon: Wallet,    title: "Your Wallet",              body: "Top up via EcoCash, Paynow or bank. Every cent is tracked in an immutable ledger you can audit any time." },
  { icon: BarChart3, title: "Your Credit Score",        body: "Upload statements, ID and bills to grow your score from 0 to 850. Higher score = larger loans, lower rates." },
  { icon: Users,     title: "Borrow & Lend",            body: "Post loan requests, accept the best bid, or lend to others and earn interest. Funds release automatically." },
  { icon: Shield,    title: "Privacy & Control",        body: "Export your data anytime, share your verified score with a one-click link, or delete your account from Settings → Privacy." },
];

export function OnboardingTour() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("user_settings").select("onboarding_completed").eq("user_id", user.id).maybeSingle();
      if (!data?.onboarding_completed) setOpen(true);
    })();
  }, [user?.id]);

  const complete = async () => {
    setOpen(false);
    if (user) await supabase.from("user_settings").update({ onboarding_completed: true }).eq("user_id", user.id);
  };

  if (!open) return null;
  const s = steps[step];
  const Icon = s.icon;
  const isLast = step === steps.length - 1;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
      >
        <motion.div
          key={step}
          initial={{ scale: 0.95, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="glass-card max-w-md w-full p-8 relative"
        >
          <button onClick={complete} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground" aria-label="Skip">
            <X className="w-4 h-4" />
          </button>
          <div className="w-14 h-14 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center mb-4 glow-primary">
            <Icon className="w-7 h-7 text-primary" />
          </div>
          <h3 className="font-display text-2xl font-bold mb-2">{s.title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{s.body}</p>

          <div className="flex items-center justify-between mt-6">
            <div className="flex gap-1.5">
              {steps.map((_, i) => (
                <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-primary" : "w-1.5 bg-muted"}`} />
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={complete}>Skip</Button>
              {isLast ? (
                <Button size="sm" onClick={complete} className="glow-primary">Get started</Button>
              ) : (
                <Button size="sm" onClick={() => setStep(step + 1)} className="glow-primary">
                  Next <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
