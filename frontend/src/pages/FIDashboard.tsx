import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Building2, Plus, Package, Inbox, CheckCircle, XCircle, Clock, ShieldAlert, Loader2, Trash2, DollarSign, Users, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";

interface LoanProduct {
  id: string; name: string; description: string | null;
  min_amount: number; max_amount: number; interest_rate: number;
  term_months: number; min_credit_score: number; requirements: string | null; active: boolean;
}
interface LoanApplication {
  id: string; user_id: string; product_id: string | null;
  amount: number; purpose: string | null; status: string;
  applied_at: string; decision_reason: string | null;
}

export default function FIDashboard() {
  const { fi, user, loading: authLoading, refreshFI } = useAuth();
  const [products, setProducts] = useState<LoanProduct[]>([]);
  const [apps, setApps] = useState<LoanApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [productOpen, setProductOpen] = useState(false);
  const [decisionApp, setDecisionApp] = useState<LoanApplication | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [borrowerNames, setBorrowerNames] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    name: "", description: "", min_amount: "", max_amount: "",
    interest_rate: "", term_months: "", min_credit_score: "0", requirements: "",
  });

  const fetchData = async () => {
    if (!fi) return;
    setLoading(true);
    const [{ data: prod }, { data: a }] = await Promise.all([
      supabase.from("loan_products").select("*").eq("fi_id", fi.id).order("created_at", { ascending: false }),
      supabase.from("loan_applications").select("*").eq("fi_id", fi.id).order("applied_at", { ascending: false }),
    ]);
    setProducts((prod as LoanProduct[]) || []);
    setApps((a as LoanApplication[]) || []);

    // Borrower names
    const ids = [...new Set((a || []).map((x: any) => x.user_id))];
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ids);
      const m: Record<string, string> = {};
      (profs || []).forEach((p: any) => { m[p.user_id] = p.full_name; });
      setBorrowerNames(m);
    }
    setLoading(false);
  };

  useEffect(() => { if (fi) fetchData(); else setLoading(false); }, [fi?.id]);
  useEffect(() => { refreshFI(); /* eslint-disable-next-line */ }, []);

  if (authLoading) {
    return <AppLayout title="FI Dashboard"><div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin" /></div></AppLayout>;
  }

  if (!fi) {
    return (
      <AppLayout title="FI Dashboard">
        <div className="max-w-lg mx-auto mt-20 text-center space-y-4">
          <ShieldAlert className="w-16 h-16 text-destructive mx-auto" />
          <h2 className="font-display text-2xl font-bold">Not a Financial Institution</h2>
          <p className="text-muted-foreground">This account is not registered as a financial institution. Please <a href="/fi-register" className="text-primary hover:underline">register here</a>.</p>
        </div>
      </AppLayout>
    );
  }

  if (fi.status !== "approved") {
    return (
      <AppLayout title="FI Dashboard">
        <div className="max-w-lg mx-auto mt-20 text-center space-y-4">
          <Clock className={`w-16 h-16 mx-auto ${fi.status === "rejected" ? "text-destructive" : "text-accent"}`} />
          <h2 className="font-display text-2xl font-bold">
            {fi.status === "pending" ? "Application Under Review" : "Application Rejected"}
          </h2>
          <p className="text-muted-foreground">
            {fi.status === "pending"
              ? `Your registration for ${fi.institution_name} is awaiting admin approval.`
              : `Your application was rejected: ${fi.rejection_reason || "No reason provided."}`}
          </p>
        </div>
      </AppLayout>
    );
  }

  const createProduct = async () => {
    const min = Number(form.min_amount), max = Number(form.max_amount);
    const rate = Number(form.interest_rate), term = Number(form.term_months);
    const minScore = Number(form.min_credit_score);
    if (!form.name || !min || !max || max < min || !rate || !term) {
      toast.error("Please fill all required fields with valid values");
      return;
    }
    const { error } = await supabase.from("loan_products").insert({
      fi_id: fi.id, name: form.name, description: form.description || null,
      min_amount: min, max_amount: max, interest_rate: rate, term_months: term,
      min_credit_score: minScore, requirements: form.requirements || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Loan product created");
    setProductOpen(false);
    setForm({ name: "", description: "", min_amount: "", max_amount: "", interest_rate: "", term_months: "", min_credit_score: "0", requirements: "" });
    fetchData();
  };

  const toggleActive = async (p: LoanProduct) => {
    const { error } = await supabase.from("loan_products").update({ active: !p.active }).eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    fetchData();
  };

  const deleteProduct = async (id: string) => {
    const { error } = await supabase.from("loan_products").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Product deleted");
    fetchData();
  };

  const decide = async (status: "approved" | "rejected") => {
    if (!decisionApp) return;
    const { error } = await supabase.from("loan_applications").update({
      status, decision_reason: decisionReason || null,
      decided_at: new Date().toISOString(), decided_by: user?.id,
    }).eq("id", decisionApp.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Application ${status}`);
    setDecisionApp(null); setDecisionReason("");
    fetchData();
  };

  const pendingApps = apps.filter((a) => a.status === "pending");
  const totalDisbursed = apps.filter((a) => a.status === "approved").reduce((s, a) => s + Number(a.amount), 0);

  return (
    <AppLayout title="FI Dashboard">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold flex items-center gap-2">
              <Building2 className="w-6 h-6 text-primary" /> {fi.institution_name}
            </h2>
            <p className="text-muted-foreground text-sm">License: {fi.license_number} · {fi.contact_email}</p>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-success/15 text-success">Approved</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <StatCard title="Active Products" value={products.filter(p => p.active).length.toString()} icon={Package} />
          <StatCard title="Pending Applications" value={pendingApps.length.toString()} icon={Inbox} />
          <StatCard title="Total Approved" value={apps.filter(a => a.status === "approved").length.toString()} icon={CheckCircle} />
          <StatCard title="Disbursed Volume" value={`$${totalDisbursed.toLocaleString()}`} icon={DollarSign} />
        </div>

        <Tabs defaultValue="applications">
          <TabsList>
            <TabsTrigger value="applications">Applications</TabsTrigger>
            <TabsTrigger value="products">Loan Products</TabsTrigger>
          </TabsList>

          <TabsContent value="applications" className="mt-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card p-6">
              <h3 className="font-display text-lg font-semibold mb-4">Borrower Applications</h3>
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : apps.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No applications yet.</p>
              ) : (
                <div className="space-y-3">
                  {apps.map((a) => {
                    const prod = products.find((p) => p.id === a.product_id);
                    return (
                      <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary">
                            <Users className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">{borrowerNames[a.user_id] || "Borrower"}</p>
                            <p className="text-xs text-muted-foreground">
                              ${Number(a.amount).toLocaleString()} · {prod?.name || "—"} · {new Date(a.applied_at).toLocaleDateString("en-GB")}
                            </p>
                            {a.purpose && <p className="text-xs text-muted-foreground italic mt-0.5">"{a.purpose}"</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            a.status === "approved" ? "bg-success/15 text-success" :
                            a.status === "rejected" ? "bg-destructive/15 text-destructive" :
                            "bg-accent/15 text-accent"
                          }`}>{a.status}</span>
                          {a.status === "pending" && (
                            <Button size="sm" variant="outline" onClick={() => setDecisionApp(a)}>Review</Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </TabsContent>

          <TabsContent value="products" className="mt-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-lg font-semibold">Loan Products</h3>
                <Button onClick={() => setProductOpen(true)} size="sm" className="glow-primary">
                  <Plus className="w-4 h-4 mr-1" /> New Product
                </Button>
              </div>
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : products.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No loan products yet. Create one to start receiving applications.</p>
              ) : (
                <div className="space-y-3">
                  {products.map((p) => (
                    <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{p.name}</p>
                          {!p.active && <span className="text-xs text-muted-foreground">(inactive)</span>}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          ${Number(p.min_amount).toLocaleString()}–${Number(p.max_amount).toLocaleString()} · {p.interest_rate}% · {p.term_months} mo · Min score {p.min_credit_score}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="ghost" onClick={() => toggleActive(p)}>
                          {p.active ? "Disable" : "Enable"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteProduct(p.id)} className="text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </TabsContent>
        </Tabs>
      </div>

      {/* New product dialog */}
      <Dialog open={productOpen} onOpenChange={setProductOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Loan Product</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Quick Cash" /></div>
            <div><Label>Description</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Min Amount (USD) *</Label><Input type="number" value={form.min_amount} onChange={(e) => setForm({ ...form, min_amount: e.target.value })} /></div>
              <div><Label>Max Amount (USD) *</Label><Input type="number" value={form.max_amount} onChange={(e) => setForm({ ...form, max_amount: e.target.value })} /></div>
              <div><Label>Interest Rate (%) *</Label><Input type="number" step="0.1" value={form.interest_rate} onChange={(e) => setForm({ ...form, interest_rate: e.target.value })} /></div>
              <div><Label>Term (months) *</Label><Input type="number" value={form.term_months} onChange={(e) => setForm({ ...form, term_months: e.target.value })} /></div>
              <div><Label>Min Credit Score</Label><Input type="number" value={form.min_credit_score} onChange={(e) => setForm({ ...form, min_credit_score: e.target.value })} /></div>
            </div>
            <div><Label>Requirements</Label><Textarea rows={2} value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} placeholder="e.g. Verified EcoCash statement, valid ID" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProductOpen(false)}>Cancel</Button>
            <Button onClick={createProduct} className="glow-primary">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decision dialog */}
      <Dialog open={!!decisionApp} onOpenChange={(o) => !o && setDecisionApp(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Application</DialogTitle>
          </DialogHeader>
          {decisionApp && (
            <div className="space-y-3 py-2 text-sm">
              <div className="p-3 rounded-lg bg-secondary/30 border border-border space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Borrower</span><span>{borrowerNames[decisionApp.user_id] || "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-bold">${Number(decisionApp.amount).toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Product</span><span>{products.find((p) => p.id === decisionApp.product_id)?.name || "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Applied</span><span>{new Date(decisionApp.applied_at).toLocaleString("en-GB")}</span></div>
                {decisionApp.purpose && <div className="pt-1"><span className="text-muted-foreground">Purpose: </span>{decisionApp.purpose}</div>}
              </div>
              <div><Label>Decision Reason (optional)</Label><Textarea rows={2} value={decisionReason} onChange={(e) => setDecisionReason(e.target.value)} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => decide("rejected")} className="text-destructive">
              <XCircle className="w-4 h-4 mr-1" /> Reject
            </Button>
            <Button onClick={() => decide("approved")} className="glow-primary">
              <CheckCircle className="w-4 h-4 mr-1" /> Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
