import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Building2, Star, Search, CheckCircle, Info, Send, Loader2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface FI {
  id: string; institution_name: string; description: string | null;
  license_number: string; logo_url: string | null;
}
interface LoanProduct {
  id: string; fi_id: string; name: string; description: string | null;
  min_amount: number; max_amount: number; interest_rate: number;
  term_months: number; min_credit_score: number; requirements: string | null;
}

const fmt = (n: number) => `$${Number(n).toLocaleString()}`;

function calcUserScore(stmts: number): number {
  // Simple: same logic as ScorePage — 0 if no docs
  if (stmts === 0) return 0;
  return Math.min(850, 200 + stmts * 100);
}

export default function MFIMarketplace() {
  const { user } = useAuth();
  const [fis, setFis] = useState<FI[]>([]);
  const [products, setProducts] = useState<LoanProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [userScore, setUserScore] = useState(0);
  const [applyDialog, setApplyDialog] = useState<{ fi: FI; product: LoanProduct } | null>(null);
  const [applyAmount, setApplyAmount] = useState("");
  const [applyReason, setApplyReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: fiData }, { data: prodData }] = await Promise.all([
        supabase.from("financial_institutions").select("id, institution_name, description, license_number, logo_url").eq("status", "approved"),
        supabase.from("loan_products").select("*").eq("active", true),
      ]);
      setFis((fiData as FI[]) || []);
      setProducts((prodData as LoanProduct[]) || []);

      if (user) {
        const [{ count: ec }, { count: cd }] = await Promise.all([
          supabase.from("ecocash_statements").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("verification_status", "verified"),
          supabase.from("credit_documents").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("verification_status", "verified"),
        ]);
        setUserScore(calcUserScore((ec || 0) + (cd || 0)));
      }
      setLoading(false);
    })();
  }, [user]);

  const filtered = fis.filter(f =>
    f.institution_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (f.description || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleApply = async () => {
    if (!applyDialog || !user) return;
    const { product, fi } = applyDialog;
    const amt = Number(applyAmount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (amt < product.min_amount || amt > product.max_amount) {
      toast.error(`Amount must be between ${fmt(product.min_amount)} and ${fmt(product.max_amount)}`);
      return;
    }
    if (userScore < product.min_credit_score) {
      toast.error(`Your Zimscore (${userScore}) is below the minimum (${product.min_credit_score})`);
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("loan_applications").insert({
      user_id: user.id, fi_id: fi.id, product_id: product.id,
      amount: amt, purpose: applyReason || null,
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Application submitted to ${fi.institution_name}`, { description: `${fmt(amt)} — ${product.name}.` });
    setApplyDialog(null); setApplyAmount(""); setApplyReason("");
  };

  return (
    <AppLayout title="MFI Marketplace">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h2 className="font-display text-2xl font-bold">Microfinance Marketplace</h2>
          <p className="text-muted-foreground text-sm">Browse approved financial institutions and apply for loans matched to your Zimscore</p>
        </div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-4 h-4 text-success" />
            <span className="text-sm font-medium">Recommended for You</span>
            <span className="text-xs text-muted-foreground">(ZimScore: {userScore})</span>
          </div>
          {products.filter(p => userScore >= p.min_credit_score).length === 0 ? (
            <p className="text-xs text-muted-foreground">No matching products yet — upload verified documents to raise your score.</p>
          ) : (
            <div className="flex gap-2 flex-wrap">
              {products.filter(p => userScore >= p.min_credit_score).map(p => {
                const fi = fis.find(f => f.id === p.fi_id);
                if (!fi) return null;
                return (
                  <button key={p.id} onClick={() => setApplyDialog({ fi, product: p })} className="px-3 py-1.5 rounded-lg bg-success/10 border border-success/20 text-xs text-success hover:bg-success/20 transition-colors">
                    {fi.institution_name}: {p.name} — {p.interest_rate}%
                  </button>
                );
              })}
            </div>
          )}
        </motion.div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search institutions..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 bg-secondary border-border" />
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="glass-card p-8 text-center text-muted-foreground">
            <Building2 className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No approved financial institutions yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((fi, i) => {
              const fiProducts = products.filter(p => p.fi_id === fi.id);
              return (
                <motion.div key={fi.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="glass-card p-6">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-sm font-bold text-primary">
                        {fi.institution_name.split(" ").map(w => w[0]).join("").slice(0, 2)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-display font-semibold">{fi.institution_name}</h3>
                          <CheckCircle className="w-4 h-4 text-success" />
                        </div>
                        <p className="text-xs text-muted-foreground">License: {fi.license_number}</p>
                      </div>
                    </div>
                  </div>
                  {fi.description && <p className="text-sm text-muted-foreground mb-4">{fi.description}</p>}

                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase">Loan Products</h4>
                    {fiProducts.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No active products from this institution.</p>
                    ) : fiProducts.map(product => {
                      const eligible = userScore >= product.min_credit_score;
                      const gap = product.min_credit_score - userScore;
                      return (
                        <div key={product.id} className={`flex items-center justify-between p-3 rounded-lg border ${eligible ? "bg-secondary/20 border-border" : "bg-secondary/10 border-border/50 opacity-70"}`}>
                          <div>
                            <p className="text-sm font-medium">{product.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {fmt(product.min_amount)}–{fmt(product.max_amount)} · {product.interest_rate}% · {product.term_months} mo · Min ZS: {product.min_credit_score}
                            </p>
                            {!eligible && (
                              <p className="text-xs text-destructive mt-0.5 flex items-center gap-1">
                                <Info className="w-3 h-3" /> Score too low — improve by {gap} points
                              </p>
                            )}
                          </div>
                          <Button size="sm" disabled={!eligible} onClick={() => setApplyDialog({ fi, product })} className={eligible ? "glow-primary" : ""}>
                            <Send className="w-3 h-3 mr-1" /> Apply
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!applyDialog} onOpenChange={open => !open && setApplyDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply for {applyDialog?.product.name}</DialogTitle>
            <DialogDescription>at {applyDialog?.fi.institution_name} — Your Zimscore ({userScore}) will be shared.</DialogDescription>
          </DialogHeader>
          {applyDialog && (
            <div className="space-y-4 py-2">
              <div className="p-3 rounded-lg bg-secondary/30 border border-border text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Range</span><span>{fmt(applyDialog.product.min_amount)}–{fmt(applyDialog.product.max_amount)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Interest</span><span>{applyDialog.product.interest_rate}%</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Term</span><span>{applyDialog.product.term_months} months</span></div>
              </div>
              <div className="space-y-2">
                <Label>Loan Amount (USD)</Label>
                <Input type="number" placeholder="Enter amount" value={applyAmount} onChange={e => setApplyAmount(e.target.value)} min={applyDialog.product.min_amount} max={applyDialog.product.max_amount} />
              </div>
              <div className="space-y-2">
                <Label>Purpose (optional)</Label>
                <Textarea placeholder="Why do you need this loan?" value={applyReason} onChange={e => setApplyReason(e.target.value)} rows={2} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyDialog(null)}>Cancel</Button>
            <Button onClick={handleApply} disabled={submitting} className="glow-primary">
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Submit Application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
