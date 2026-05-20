import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Rocket, Users, Clock, Plus, Heart, Search, TrendingUp, CheckCircle, Shield, CircleDollarSign, RotateCcw } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { formatCurrency } from "@/lib/mock-data";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const categories = ["All", "Energy", "Technology", "Infrastructure", "Health", "Education", "Agriculture"];

type Campaign = {
  id: string;
  entrepreneur_id: string;
  title: string;
  description: string;
  category: string | null;
  target_amount: number;
  raised_amount: number;
  deadline: string;
  status: string;
  cover_image_url: string | null;
};

type Pledge = {
  id: string;
  campaign_id: string;
  investor_id: string;
  amount: number;
  status: string;
  created_at: string;
};

export default function Crowdfunding() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [myPledges, setMyPledges] = useState<Pledge[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [backDialog, setBackDialog] = useState<Campaign | null>(null);
  const [backAmount, setBackAmount] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [mainTab, setMainTab] = useState("browse");
  const [busy, setBusy] = useState(false);

  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newGoal, setNewGoal] = useState("");
  const [newCategory, setNewCategory] = useState("Technology");
  const [newDays, setNewDays] = useState("30");

  const load = async () => {
    if (!user) return;
    const [{ data: c }, { data: p }] = await Promise.all([
      supabase.from("campaigns").select("*").in("status", ["active", "funded", "failed", "completed"]).order("created_at", { ascending: false }),
      supabase.from("pledges").select("*").eq("investor_id", user.id).order("created_at", { ascending: false }),
    ]);
    setCampaigns((c ?? []) as Campaign[]);
    setMyPledges((p ?? []) as Pledge[]);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  const filtered = campaigns.filter(p => {
    const matchesCat = categoryFilter === "All" || p.category === categoryFilter;
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
    return matchesCat && matchesSearch;
  });

  const myCampaigns = campaigns.filter(c => c.entrepreneur_id === user?.id);
  const totalBacked = myPledges.filter(p => p.status !== "refunded").reduce((s, b) => s + Number(b.amount), 0);

  const daysLeft = (deadline: string) => Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000));

  const handleBack = async () => {
    if (!backDialog) return;
    const amt = Number(backAmount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("pledge_to_campaign", { _campaign_id: backDialog.id, _amount: amt });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${formatCurrency(amt)} pledged`, { description: "Funds held in escrow until the entrepreneur releases them." });
    setBackDialog(null); setBackAmount("");
    load();
  };

  const handleCreateCampaign = async () => {
    if (!user) return;
    if (!newTitle.trim() || !newDesc.trim() || !newGoal) { toast.error("Please fill in all fields"); return; }
    const goal = Number(newGoal);
    if (goal < 100) { toast.error("Minimum goal is $100"); return; }
    const deadline = new Date(Date.now() + Number(newDays) * 86400000).toISOString();
    const { error } = await supabase.from("campaigns").insert({
      entrepreneur_id: user.id, title: newTitle, description: newDesc,
      target_amount: goal, deadline, category: newCategory, status: "active",
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Campaign launched!");
    setCreateOpen(false);
    setNewTitle(""); setNewDesc(""); setNewGoal(""); setNewCategory("Technology"); setNewDays("30");
    load();
  };

  const releaseFunds = async (id: string) => {
    setBusy(true);
    const { error } = await supabase.rpc("release_campaign_funds", { _campaign_id: id });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Escrow released to your wallet");
    load();
  };

  const refundCampaign = async (id: string) => {
    setBusy(true);
    const { error } = await supabase.rpc("refund_campaign", { _campaign_id: id });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("All backers refunded");
    load();
  };

  const quickBackAmounts = [10, 25, 50, 100, 250];
  const escrowLabel: Record<string, { label: string; color: string }> = {
    escrow: { label: "In Escrow", color: "bg-accent/15 text-accent" },
    released: { label: "Released", color: "bg-success/15 text-success" },
    refunded: { label: "Refunded", color: "bg-destructive/15 text-destructive" },
  };

  return (
    <AppLayout title="Crowdfunding">
      <div className="max-w-5xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h2 className="font-display text-2xl font-bold">Community Crowdfunding</h2>
            <p className="text-muted-foreground text-sm">Fund projects · Escrow-protected pledges</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="glow-primary"><Plus className="w-4 h-4 mr-2" /> Create Campaign</Button>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Active Campaigns", value: campaigns.filter(c => c.status === "active").length.toString(), icon: Rocket, color: "text-primary" },
            { label: "Your Contributions", value: formatCurrency(totalBacked), icon: Heart, color: "text-success" },
            { label: "Projects Backed", value: new Set(myPledges.map(b => b.campaign_id)).size.toString(), icon: TrendingUp, color: "text-accent" },
          ].map(stat => (
            <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-secondary ${stat.color}`}><stat.icon className="w-5 h-5" /></div>
              <div><p className="text-xs text-muted-foreground">{stat.label}</p><p className="font-display font-bold text-lg">{stat.value}</p></div>
            </motion.div>
          ))}
        </div>

        <Tabs value={mainTab} onValueChange={setMainTab}>
          <TabsList>
            <TabsTrigger value="browse">Browse</TabsTrigger>
            <TabsTrigger value="mypledges">My Pledges ({myPledges.length})</TabsTrigger>
            <TabsTrigger value="mycampaigns">My Campaigns ({myCampaigns.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="browse" className="space-y-4 mt-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search projects..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 bg-secondary border-border" />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {categories.map(cat => (
                  <button key={cat} onClick={() => setCategoryFilter(cat)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${categoryFilter === cat ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground border border-border"}`}>{cat}</button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-8 col-span-2">No campaigns found.</p>}
              {filtered.map((project, i) => {
                const pct = Math.min(100, (Number(project.raised_amount) / Number(project.target_amount)) * 100);
                const isFunded = project.status === "funded" || project.status === "completed";
                return (
                  <motion.div key={project.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="glass-card-hover p-5">
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      {project.category && <span className="px-2.5 py-0.5 rounded-full bg-primary/15 text-primary text-xs font-medium">{project.category}</span>}
                      <span className="px-2.5 py-0.5 rounded-full bg-accent/15 text-accent text-xs font-medium"><Shield className="w-3 h-3 inline mr-1" />Escrow</span>
                      {isFunded && <span className="px-2.5 py-0.5 rounded-full bg-success/15 text-success text-xs font-medium">Funded ✓</span>}
                      {project.status === "failed" && <span className="px-2.5 py-0.5 rounded-full bg-destructive/15 text-destructive text-xs font-medium">Failed</span>}
                      <span className="flex items-center gap-1 text-xs text-muted-foreground ml-auto"><Clock className="w-3 h-3" /> {daysLeft(project.deadline)}d</span>
                    </div>
                    <h3 className="font-display font-semibold mb-1">{project.title}</h3>
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{project.description}</p>
                    <div className="space-y-2">
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <motion.div className={`h-full rounded-full ${isFunded ? "bg-success" : "bg-gradient-to-r from-primary to-success"}`} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }} />
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold">{formatCurrency(Number(project.raised_amount))} <span className="text-muted-foreground font-normal">of {formatCurrency(Number(project.target_amount))}</span></span>
                        <span className="text-muted-foreground">{pct.toFixed(0)}%</span>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <button disabled={isFunded || project.status === "failed" || project.entrepreneur_id === user?.id} onClick={() => setBackDialog(project)} className="flex-1 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 border border-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        {project.entrepreneur_id === user?.id ? "Your campaign" : isFunded ? "Fully Funded" : project.status === "failed" ? "Closed" : "Back This Project"}
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="mypledges" className="mt-4">
            {myPledges.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Heart className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">You haven't backed any projects yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {myPledges.map((b) => {
                  const proj = campaigns.find(p => p.id === b.campaign_id);
                  const lbl = escrowLabel[b.status] || { label: b.status, color: "bg-secondary text-muted-foreground" };
                  return (
                    <div key={b.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border">
                      <div>
                        <p className="text-sm font-medium">{proj?.title ?? "Unknown campaign"}</p>
                        <p className="text-xs text-muted-foreground">{new Date(b.created_at).toLocaleDateString("en-GB")}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${lbl.color}`}>{lbl.label}</span>
                        <p className="font-display font-bold text-success">{formatCurrency(Number(b.amount))}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="mycampaigns" className="mt-4 space-y-3">
            {myCampaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">You haven't launched any campaigns.</p>
            ) : myCampaigns.map(c => {
              const pct = Math.min(100, (Number(c.raised_amount) / Number(c.target_amount)) * 100);
              const canRelease = c.status === "funded" || (c.status === "active" && Number(c.raised_amount) > 0);
              return (
                <div key={c.id} className="p-4 rounded-lg bg-secondary/30 border border-border">
                  <div className="flex justify-between items-start gap-3">
                    <div>
                      <p className="font-semibold text-sm">{c.title}</p>
                      <p className="text-xs text-muted-foreground capitalize">{c.status} · {formatCurrency(Number(c.raised_amount))} / {formatCurrency(Number(c.target_amount))} · {pct.toFixed(0)}%</p>
                    </div>
                    <div className="flex gap-2">
                      {canRelease && <Button size="sm" onClick={() => releaseFunds(c.id)} disabled={busy}><CircleDollarSign className="w-3 h-3 mr-1" /> Release</Button>}
                      {(c.status === "active" || c.status === "funded") && <Button size="sm" variant="outline" onClick={() => refundCampaign(c.id)} disabled={busy}><RotateCcw className="w-3 h-3 mr-1" /> Refund All</Button>}
                    </div>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden mt-2">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={!!backDialog} onOpenChange={open => !open && setBackDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Back "{backDialog?.title}"</DialogTitle><DialogDescription>Funds are held in escrow until the entrepreneur releases them.</DialogDescription></DialogHeader>
          {backDialog && (
            <div className="space-y-4 py-2">
              <div className="p-3 rounded-lg bg-secondary/30 border border-border text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Goal</span><span>{formatCurrency(Number(backDialog.target_amount))}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Raised</span><span className="text-success">{formatCurrency(Number(backDialog.raised_amount))}</span></div>
              </div>
              <div className="space-y-2">
                <Label>Amount (USD)</Label>
                <Input type="number" placeholder="0.00" value={backAmount} onChange={e => setBackAmount(e.target.value)} min={1} />
                <div className="flex gap-2 flex-wrap">
                  {quickBackAmounts.map(qa => <button key={qa} onClick={() => setBackAmount(String(qa))} className="px-3 py-1 rounded-full text-xs bg-secondary border border-border hover:border-primary/30">${qa}</button>)}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBackDialog(null)}>Cancel</Button>
            <Button onClick={handleBack} className="glow-primary" disabled={busy}>Contribute</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create Campaign</DialogTitle><DialogDescription>Launch a crowdfunding campaign with escrow protection.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2"><Label>Project Title</Label><Input placeholder="e.g. Solar Panels for School" value={newTitle} onChange={e => setNewTitle(e.target.value)} /></div>
            <div className="space-y-2"><Label>Pitch Description</Label><Textarea placeholder="Describe impact and goals..." value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={3} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Funding Goal (USD)</Label><Input type="number" placeholder="5000" value={newGoal} onChange={e => setNewGoal(e.target.value)} min={100} /></div>
              <div className="space-y-2"><Label>Duration</Label>
                <select value={newDays} onChange={e => setNewDays(e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                  {[15, 30, 45, 60, 90].map(d => <option key={d} value={d}>{d} days</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <div className="flex gap-2 flex-wrap">
                {categories.filter(c => c !== "All").map(cat => (
                  <button key={cat} onClick={() => setNewCategory(cat)} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${newCategory === cat ? "bg-primary/15 border-primary/40 text-primary" : "bg-secondary border-border text-muted-foreground"}`}>{cat}</button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateCampaign} className="glow-primary"><Rocket className="w-4 h-4 mr-2" /> Launch Campaign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
