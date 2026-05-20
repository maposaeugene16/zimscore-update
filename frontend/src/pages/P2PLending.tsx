import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, AlertTriangle, CheckCircle, DollarSign, Search, Plus, FileText, Flag, CalendarClock } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { formatCurrency } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type LoanRequest = {
  id: string;
  borrower_id: string;
  amount: number;
  purpose: string;
  term_months: number;
  max_interest_rate: number;
  status: string;
  accepted_bid_id: string | null;
  created_at: string;
};

type Bid = {
  id: string;
  request_id: string;
  lender_id: string;
  amount: number;
  interest_rate: number;
  term_months: number;
  status: string;
  created_at: string;
};

type ScheduleRow = {
  id: string;
  loan_id: string;
  due_date: string;
  amount_due: number;
  amount_paid: number;
  status: string;
};

const purposes = ["Farm Equipment", "School Fees", "Business Expansion", "Medical Bills", "Vehicle Repair", "Home Improvement", "Inventory Purchase", "Other"];
const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-GB");

export default function P2PLending() {
  const { user } = useAuth();
  const [loans, setLoans] = useState<LoanRequest[]>([]);
  const [myBids, setMyBids] = useState<Bid[]>([]);
  const [bidsByRequest, setBidsByRequest] = useState<Record<string, Bid[]>>({});
  const [schedule, setSchedule] = useState<ScheduleRow[]>([]);
  const [selectedLoan, setSelectedLoan] = useState<string | null>(null);
  const [bidAmounts, setBidAmounts] = useState<Record<string, string>>({});
  const [bidRates, setBidRates] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [mainTab, setMainTab] = useState("browse");
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [reqAmount, setReqAmount] = useState("");
  const [reqPurpose, setReqPurpose] = useState("");
  const [reqTermMonths, setReqTermMonths] = useState("3");
  const [reqMaxRate, setReqMaxRate] = useState("");
  const [reqCollateralId, setReqCollateralId] = useState<string>("");
  const [availableCollateral, setAvailableCollateral] = useState<{ id: string; description: string; estimated_value: number; asset_type: string }[]>([]);

  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeEvidence, setDisputeEvidence] = useState<File | null>(null);

  const loadAll = async () => {
    if (!user) return;
    const [{ data: lreq }, { data: mb }, { data: ownReqBids }, { data: sched }, { data: col }] = await Promise.all([
      supabase.from("loan_requests").select("*").in("status", ["open", "funded"]).order("created_at", { ascending: false }),
      supabase.from("bids").select("*").eq("lender_id", user.id).order("created_at", { ascending: false }),
      supabase.from("bids").select("*").order("created_at", { ascending: false }),
      supabase.from("repayment_schedule").select("*").eq("user_id", user.id).order("due_date", { ascending: true }),
      supabase.from("collateral_assets").select("id, description, estimated_value, asset_type").eq("user_id", user.id).eq("status", "available"),
    ]);
    setLoans((lreq ?? []) as LoanRequest[]);
    setMyBids((mb ?? []) as Bid[]);
    const map: Record<string, Bid[]> = {};
    ((ownReqBids ?? []) as Bid[]).forEach(b => { (map[b.request_id] ||= []).push(b); });
    setBidsByRequest(map);
    setSchedule((sched ?? []) as ScheduleRow[]);
    setAvailableCollateral((col ?? []) as any);
  };

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [user?.id]);

  const myRequests = loans.filter(l => l.borrower_id === user?.id);
  const browseLoans = loans.filter(l => l.borrower_id !== user?.id && l.status === "open");

  const filteredLoans = useMemo(() => browseLoans.filter(l => {
    const q = searchQuery.toLowerCase();
    return !q || l.purpose.toLowerCase().includes(q) || l.borrower_id.toLowerCase().includes(q);
  }), [browseLoans, searchQuery]);

  const totalInvested = myBids.filter(b => ["pending","accepted"].includes(b.status)).reduce((s, b) => s + Number(b.amount), 0);

  const placeBid = async (loan: LoanRequest) => {
    if (!riskAcknowledged) { toast.error("Please acknowledge the lending risk disclaimer"); return; }
    const amt = Number(bidAmounts[loan.id]);
    const rate = Number(bidRates[loan.id] || loan.max_interest_rate);
    if (!amt || amt <= 0) { toast.error("Enter a valid bid amount"); return; }
    if (amt > loan.amount) { toast.error(`Max bid is ${formatCurrency(loan.amount)}`); return; }
    if (rate > loan.max_interest_rate) { toast.error(`Rate exceeds borrower max of ${loan.max_interest_rate}%`); return; }
    setBusy(true);
    const { error } = await supabase.rpc("place_bid", {
      _request_id: loan.id,
      _amount: amt,
      _interest_rate: rate,
      _term_months: loan.term_months,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Bid placed: ${formatCurrency(amt)} at ${rate}%`, { description: "Funds locked in your wallet until the borrower accepts or rejects." });
    setBidAmounts(p => ({ ...p, [loan.id]: "" })); setBidRates(p => ({ ...p, [loan.id]: "" }));
    setSelectedLoan(null);
    loadAll();
  };

  const acceptBid = async (bid: Bid) => {
    setBusy(true);
    const { error } = await supabase.rpc("accept_bid", { _bid_id: bid.id });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Bid accepted — funds disbursed to your wallet");
    loadAll();
  };

  const withdrawBid = async (bid: Bid) => {
    setBusy(true);
    const { error } = await supabase.rpc("withdraw_bid", { _bid_id: bid.id });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Bid withdrawn — funds released");
    loadAll();
  };

  const repay = async (s: ScheduleRow) => {
    setBusy(true);
    const { error } = await supabase.rpc("repay_installment", { _schedule_id: s.id });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Repayment posted");
    loadAll();
  };

  const handleCreateLoanRequest = async () => {
    if (!user) return;
    const amt = Number(reqAmount);
    if (!amt || amt < 5 || amt > 5000) { toast.error("Amount must be $5–$5,000"); return; }
    if (!reqPurpose) { toast.error("Select a purpose"); return; }
    const months = Number(reqTermMonths);
    if (!months || months < 1 || months > 24) { toast.error("Term must be 1–24 months"); return; }
    if (!reqMaxRate || Number(reqMaxRate) <= 0) { toast.error("Enter max interest rate"); return; }
    const { error } = await supabase.from("loan_requests").insert({
      borrower_id: user.id,
      amount: amt,
      purpose: reqPurpose,
      term_months: months,
      max_interest_rate: Number(reqMaxRate),
      status: "open",
    });
    if (error) {
      toast.error(error.message.includes("unique") ? "You already have an active loan request." : error.message);
      return;
    }
    toast.success("Loan request created");
    setCreateOpen(false);
    setReqAmount(""); setReqPurpose(""); setReqTermMonths("3"); setReqMaxRate("");
    loadAll();
  };

  const handleDispute = () => {
    if (!disputeReason.trim()) { toast.error("Please provide a reason"); return; }
    if (!disputeEvidence) { toast.error("Evidence is required"); return; }
    toast.success("Dispute filed — admin will review");
    setDisputeOpen(false); setDisputeReason(""); setDisputeEvidence(null);
  };

  return (
    <AppLayout title="P2P Lending">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h2 className="font-display text-2xl font-bold">P2P Lending Marketplace</h2>
            <p className="text-muted-foreground text-sm">Borrow or lend directly · Funds ring-fenced in your wallet</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDisputeOpen(true)}><Flag className="w-4 h-4 mr-2" /> Dispute</Button>
            <Button onClick={() => setCreateOpen(true)} className="glow-primary"><Plus className="w-4 h-4 mr-2" /> Request Loan</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Open Listings", value: browseLoans.length.toString(), icon: Users },
            { label: "Locked in Bids", value: formatCurrency(totalInvested), icon: DollarSign },
            { label: "Your Requests", value: myRequests.length.toString(), icon: FileText },
          ].map(stat => (
            <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-secondary text-primary"><stat.icon className="w-5 h-5" /></div>
              <div><p className="text-xs text-muted-foreground">{stat.label}</p><p className="font-display font-bold text-lg">{stat.value}</p></div>
            </motion.div>
          ))}
        </div>

        {!riskAcknowledged && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-200">Lending Risk Disclaimer</p>
                <p className="text-xs text-amber-200/70 mt-1">P2P lending carries financial risk. You may lose your capital if the borrower defaults.</p>
                <label className="flex items-center gap-2 mt-2 cursor-pointer">
                  <input type="checkbox" onChange={e => setRiskAcknowledged(e.target.checked)} className="rounded" />
                  <span className="text-xs text-amber-200">I understand and accept the risks of P2P lending</span>
                </label>
              </div>
            </div>
          </motion.div>
        )}

        <Tabs value={mainTab} onValueChange={setMainTab}>
          <TabsList>
            <TabsTrigger value="browse">Browse</TabsTrigger>
            <TabsTrigger value="mybids">My Bids ({myBids.length})</TabsTrigger>
            <TabsTrigger value="myrequests">My Requests ({myRequests.length})</TabsTrigger>
            <TabsTrigger value="repayments">Repayments ({schedule.filter(s=>s.status!=="paid").length})</TabsTrigger>
          </TabsList>

          <TabsContent value="browse" className="space-y-4 mt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search by purpose..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 bg-secondary border-border" />
            </div>

            <div className="space-y-3">
              {filteredLoans.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No open loan requests right now.</p>}
              {filteredLoans.map(loan => (
                <motion.div key={loan.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className={cn("p-4 rounded-xl border transition-all cursor-pointer", selectedLoan === loan.id ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/20 bg-secondary/20")}
                  onClick={() => setSelectedLoan(selectedLoan === loan.id ? null : loan.id)}>
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary">{loan.borrower_id.slice(0,2).toUpperCase()}</div>
                      <div>
                        <p className="font-semibold text-sm">Borrower …{loan.borrower_id.slice(-6)}</p>
                        <p className="text-xs text-muted-foreground">{loan.purpose} · {loan.term_months} months</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-display font-bold">{formatCurrency(loan.amount)}</p>
                      <p className="text-xs text-muted-foreground">Max {loan.max_interest_rate}%</p>
                    </div>
                  </div>

                  <AnimatePresence>
                    {selectedLoan === loan.id && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="mt-4 pt-4 border-t border-border space-y-3">
                          <div className="flex gap-3">
                            <Input type="number" placeholder="Bid amount" value={bidAmounts[loan.id] || ""} onChange={e => setBidAmounts(p => ({ ...p, [loan.id]: e.target.value }))} onClick={e => e.stopPropagation()} className="flex-1 bg-secondary border-border" min={1} />
                            <Input type="number" placeholder={`Rate (max ${loan.max_interest_rate}%)`} value={bidRates[loan.id] || ""} onChange={e => setBidRates(p => ({ ...p, [loan.id]: e.target.value }))} onClick={e => e.stopPropagation()} className="w-32 bg-secondary border-border" />
                            <Button onClick={e => { e.stopPropagation(); placeBid(loan); }} className="glow-primary" disabled={busy}>Bid</Button>
                          </div>
                          <p className="text-xs text-muted-foreground">Est. return: ~{formatCurrency(Number(bidAmounts[loan.id] || 0) * (1 + (Number(bidRates[loan.id]) || loan.max_interest_rate) / 100))}</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="mybids" className="mt-4">
            {myBids.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground"><DollarSign className="w-8 h-8 mx-auto mb-2 opacity-50" /><p className="text-sm">No bids placed yet.</p></div>
            ) : (
              <div className="space-y-3">
                {myBids.map(b => (
                  <div key={b.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border">
                    <div>
                      <p className="text-sm font-medium">{formatCurrency(Number(b.amount))} @ {b.interest_rate}%</p>
                      <p className="text-xs text-muted-foreground capitalize">{fmtDate(b.created_at)} · {b.term_months} months · {b.status}</p>
                    </div>
                    {b.status === "pending" && (
                      <Button size="sm" variant="outline" onClick={() => withdrawBid(b)} disabled={busy}>Withdraw</Button>
                    )}
                    {b.status === "accepted" && (
                      <span className="px-2 py-1 rounded-full text-xs bg-success/15 text-success flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Funded</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="myrequests" className="mt-4 space-y-4">
            {myRequests.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground"><FileText className="w-8 h-8 mx-auto mb-2 opacity-50" /><p className="text-sm">No loan requests yet.</p></div>
            ) : (
              myRequests.map(req => {
                const bids = bidsByRequest[req.id] || [];
                return (
                  <div key={req.id} className="p-4 rounded-lg bg-secondary/30 border border-border space-y-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-semibold text-sm">{formatCurrency(Number(req.amount))} — {req.purpose}</p>
                        <p className="text-xs text-muted-foreground">{req.term_months} months · Max {req.max_interest_rate}%</p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-accent/15 text-accent capitalize">{req.status}</span>
                    </div>
                    {req.status === "open" && bids.filter(b => b.status === "pending").length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-border">
                        <p className="text-xs text-muted-foreground">Incoming bids:</p>
                        {bids.filter(b => b.status === "pending").map(b => (
                          <div key={b.id} className="flex items-center justify-between p-2 rounded bg-background/40">
                            <div className="text-xs">
                              <span className="font-medium">{formatCurrency(Number(b.amount))}</span> @ {b.interest_rate}% · Lender …{b.lender_id.slice(-6)}
                            </div>
                            <Button size="sm" onClick={() => acceptBid(b)} disabled={busy}>Accept</Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="repayments" className="mt-4">
            {schedule.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground"><CalendarClock className="w-8 h-8 mx-auto mb-2 opacity-50" /><p className="text-sm">No repayments scheduled.</p></div>
            ) : (
              <div className="space-y-2">
                {schedule.map(s => (
                  <div key={s.id} className={cn("flex items-center justify-between p-3 rounded-lg border", s.status === "paid" ? "bg-success/5 border-success/20" : s.status === "overdue" ? "bg-destructive/5 border-destructive/30" : "bg-secondary/30 border-border")}>
                    <div>
                      <p className="text-sm font-medium">{formatCurrency(Number(s.amount_due))}</p>
                      <p className="text-xs text-muted-foreground">Due {fmtDate(s.due_date)} · <span className="capitalize">{s.status}</span></p>
                    </div>
                    {s.status !== "paid" && <Button size="sm" onClick={() => repay(s)} disabled={busy}>Repay</Button>}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create Loan Request</DialogTitle><DialogDescription>Only one active request allowed at a time.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Amount (USD)</Label>
              <Input type="number" placeholder="e.g. 200" value={reqAmount} onChange={e => setReqAmount(e.target.value)} min={5} max={5000} />
            </div>
            <div className="space-y-2">
              <Label>Purpose</Label>
              <select value={reqPurpose} onChange={e => setReqPurpose(e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Select purpose...</option>
                {purposes.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Term (months)</Label>
                <select value={reqTermMonths} onChange={e => setReqTermMonths(e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                  {[1, 2, 3, 6, 12, 24].map(d => <option key={d} value={d}>{d} months</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Max Interest Rate (%)</Label>
                <Input type="number" placeholder="e.g. 12" value={reqMaxRate} onChange={e => setReqMaxRate(e.target.value)} min={1} max={40} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateLoanRequest} className="glow-primary">Submit Request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dispute */}
      <Dialog open={disputeOpen} onOpenChange={setDisputeOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>File a Dispute</DialogTitle><DialogDescription>Disputed loans are placed on hold pending admin review.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Reason</Label><Textarea placeholder="Describe the issue..." value={disputeReason} onChange={e => setDisputeReason(e.target.value)} rows={3} /></div>
            <div className="space-y-2">
              <Label>Evidence (required)</Label>
              <label className="flex items-center justify-center p-4 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/30 bg-secondary/30">
                {disputeEvidence ? <span className="text-sm text-foreground">{disputeEvidence.name}</span> : <span className="text-sm text-muted-foreground">Upload screenshot, receipt, or document</span>}
                <input type="file" className="hidden" onChange={e => setDisputeEvidence(e.target.files?.[0] || null)} />
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisputeOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDispute}>File Dispute</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
