import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, ArrowUpRight, ArrowDownLeft, Lock, Plus, Minus, Copy, Download, Search, Shield, ShieldOff, AlertTriangle } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { formatCurrency } from "@/lib/mock-data";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type LedgerRow = {
  id: string;
  entry_type: string;
  direction: "credit" | "debit";
  amount: number;
  description: string;
  reference: string | null;
  created_at: string;
  balance_after: number;
};

const txCategories = ["All", "deposit", "withdrawal", "disbursement", "repayment", "fee", "hold", "release_hold", "escrow"];
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB");

export default function WalletPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [locked, setLocked] = useState(0);
  const [walletFrozen, setWalletFrozen] = useState(false);
  const [lowBalanceThreshold, setLowBalanceThreshold] = useState<number | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);

  const [filter, setFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("ecocash");
  const [accountRef, setAccountRef] = useState("");
  const [alertAmount, setAlertAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const loadAll = async () => {
    if (!user) return;
    const [{ data: w }, { data: s }, { data: l }] = await Promise.all([
      supabase.from("wallets").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("wallet_ledger").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(200),
    ]);
    setBalance(Number(w?.balance ?? 0));
    setLocked(Number(w?.locked_balance ?? 0));
    setWalletFrozen(Boolean(s?.wallet_frozen));
    setLowBalanceThreshold(s?.low_balance_threshold ?? null);
    setLedger((l ?? []) as LedgerRow[]);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    if (!user) return;
    const channel = supabase
      .channel("wallet-" + user.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "wallets", filter: `user_id=eq.${user.id}` }, loadAll)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "wallet_ledger", filter: `user_id=eq.${user.id}` }, loadAll)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const filtered = useMemo(() => ledger.filter((t) => {
    const matchesType = filter === "all" || t.direction === filter;
    const matchesCat = categoryFilter === "All" || t.entry_type === categoryFilter;
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || t.description.toLowerCase().includes(q) || (t.reference || "").toLowerCase().includes(q);
    return matchesType && matchesCat && matchesSearch;
  }), [ledger, filter, categoryFilter, searchQuery]);

  const totalIncome = ledger.filter(t => t.direction === "credit" && !["release_hold"].includes(t.entry_type)).reduce((s, t) => s + Number(t.amount), 0);
  const totalExpenses = ledger.filter(t => t.direction === "debit" && !["hold","escrow"].includes(t.entry_type)).reduce((s, t) => s + Number(t.amount), 0);

  const callEcoCash = async (action: "deposit" | "withdraw", amt: number) => {
    const { data, error } = await supabase.functions.invoke("ecocash-payment", {
      body: { action, amount: amt, phone: accountRef },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data as { mock?: boolean; reference?: string; message?: string };
  };

  const handleDeposit = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (amt > 10000) { toast.error("Maximum deposit is $10,000"); return; }
    if (method === "ecocash" && !accountRef.trim()) { toast.error("Enter your EcoCash phone number"); return; }
    setBusy(true);
    try {
      let reference: string | null = null;
      if (method === "ecocash") {
        const eco = await callEcoCash("deposit", amt);
        reference = eco.reference ?? null;
        toast.info(eco.message ?? "EcoCash request sent");
      }
      const { error } = await supabase.rpc("wallet_deposit", { _amount: amt, _method: method, _reference: reference });
      if (error) throw new Error(error.message);
      toast.success(`${formatCurrency(amt)} deposited via ${method}`);
      setDepositOpen(false); setAmount(""); setAccountRef("");
      loadAll();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Deposit failed");
    } finally {
      setBusy(false);
    }
  };

  const handleWithdraw = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (amt > balance) { toast.error(`Insufficient balance: ${formatCurrency(balance)}`); return; }
    if (!accountRef.trim()) { toast.error("Enter destination"); return; }
    setBusy(true);
    try {
      if (method === "ecocash") {
        const eco = await callEcoCash("withdraw", amt);
        toast.info(eco.message ?? "EcoCash disbursement initiated");
      }
      const { error } = await supabase.rpc("wallet_withdraw", { _amount: amt, _method: method, _destination: accountRef });
      if (error) throw new Error(error.message);
      toast.success(`${formatCurrency(amt)} withdrawn via ${method}`);
      setWithdrawOpen(false); setAmount(""); setAccountRef("");
      loadAll();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Withdrawal failed");
    } finally {
      setBusy(false);
    }
  };

  const toggleFreeze = async () => {
    if (!user) return;
    const newVal = !walletFrozen;
    const { error } = await supabase.from("user_settings").upsert(
      { user_id: user.id, wallet_frozen: newVal },
      { onConflict: "user_id" },
    );
    if (error) { toast.error(error.message); return; }
    setWalletFrozen(newVal);
    toast[newVal ? "warning" : "success"](newVal ? "Wallet frozen. Outgoing transactions blocked." : "Wallet unfrozen.");
    setFreezeOpen(false);
  };

  const setAlert = async () => {
    if (!user) return;
    const threshold = Number(alertAmount);
    if (!threshold || threshold <= 0) { toast.error("Enter a valid amount"); return; }
    const { error } = await supabase.from("user_settings").upsert(
      { user_id: user.id, low_balance_threshold: threshold },
      { onConflict: "user_id" },
    );
    if (error) { toast.error(error.message); return; }
    setLowBalanceThreshold(threshold);
    toast.success(`Alert set at ${formatCurrency(threshold)}`);
    setAlertOpen(false); setAlertAmount("");
  };

  const copyWalletId = () => {
    if (!user) return;
    navigator.clipboard.writeText("ZIM-" + user.id.slice(0, 8).toUpperCase());
    toast.success("Wallet ID copied");
  };

  const exportTransactions = () => {
    const csv = ["Date,Description,Type,Direction,Amount,Reference,Balance After"]
      .concat(filtered.map(t => `${fmtDate(t.created_at)},"${t.description.replace(/"/g,"'")}",${t.entry_type},${t.direction},${t.direction === "credit" ? "" : "-"}${t.amount},${t.reference || ""},${t.balance_after}`))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "transactions.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const quickAmounts = [50, 100, 250, 500, 1000];

  if (loading) return <AppLayout title="Wallet"><div className="p-8 text-center text-muted-foreground">Loading wallet…</div></AppLayout>;

  return (
    <AppLayout title="Wallet">
      <div className="max-w-5xl mx-auto space-y-6">
        {walletFrozen && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 flex items-center gap-2 text-sm text-destructive">
            <Shield className="w-4 h-4" />
            <span className="font-medium">Wallet is frozen.</span> All outgoing transactions are blocked.
            <Button size="sm" variant="outline" className="ml-auto text-xs" onClick={() => setFreezeOpen(true)}>Unfreeze</Button>
          </motion.div>
        )}

        {lowBalanceThreshold && balance < lowBalanceThreshold && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />Balance below your alert threshold of {formatCurrency(lowBalanceThreshold)}.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard title="Available Balance" value={formatCurrency(balance)} icon={Wallet} />
          <StatCard title="Locked Balance" value={formatCurrency(locked)} subtitle="In active bids & escrow" icon={Lock} />
          <StatCard title="Total Balance" value={formatCurrency(balance + locked)} icon={Wallet} />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => setDepositOpen(true)} className="glow-primary" disabled={walletFrozen}><Plus className="w-4 h-4 mr-2" /> Deposit</Button>
            <Button variant="outline" onClick={() => setWithdrawOpen(true)} disabled={walletFrozen}><Minus className="w-4 h-4 mr-2" /> Withdraw</Button>
            <Button variant="outline" onClick={() => setFreezeOpen(true)}>
              {walletFrozen ? <ShieldOff className="w-4 h-4 mr-2" /> : <Shield className="w-4 h-4 mr-2" />}
              {walletFrozen ? "Unfreeze" : "Freeze"}
            </Button>
            <Button variant="outline" onClick={() => setAlertOpen(true)}><AlertTriangle className="w-4 h-4 mr-2" /> Alert</Button>
          </div>
          <button onClick={copyWalletId} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg bg-secondary/50 border border-border">
            <Copy className="w-3 h-3" /> Wallet ID: ZIM-{user?.id.slice(0, 8).toUpperCase()}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-success/15"><ArrowDownLeft className="w-5 h-5 text-success" /></div>
            <div><p className="text-xs text-muted-foreground">Total Income</p><p className="font-display font-bold text-success">{formatCurrency(totalIncome)}</p></div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-card p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/15"><ArrowUpRight className="w-5 h-5 text-destructive" /></div>
            <div><p className="text-xs text-muted-foreground">Total Expenses</p><p className="font-display font-bold text-destructive">{formatCurrency(totalExpenses)}</p></div>
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
            <h3 className="font-display text-lg font-semibold">Transaction Ledger</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={exportTransactions}><Download className="w-3 h-3 mr-1" /> Export CSV</Button>
              <Tabs value={filter} onValueChange={setFilter}>
                <TabsList className="h-8">
                  <TabsTrigger value="all" className="text-xs px-3 h-6">All</TabsTrigger>
                  <TabsTrigger value="credit" className="text-xs px-3 h-6">Income</TabsTrigger>
                  <TabsTrigger value="debit" className="text-xs px-3 h-6">Expenses</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>

          <div className="flex gap-1.5 flex-wrap mb-3">
            {txCategories.map(cat => (
              <button key={cat} onClick={() => setCategoryFilter(cat)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors capitalize ${categoryFilter === cat ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground border border-border"}`}>
                {cat}
              </button>
            ))}
          </div>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search by description or reference..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 bg-secondary border-border" />
          </div>

          <div className="space-y-1">
            <AnimatePresence>
              {filtered.map((tx) => (
                <motion.div key={tx.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="flex items-center justify-between p-3 rounded-lg hover:bg-secondary/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${tx.direction === 'credit' ? 'bg-success/15' : 'bg-destructive/15'}`}>
                      {tx.direction === 'credit' ? <ArrowDownLeft className="w-4 h-4 text-success" /> : <ArrowUpRight className="w-4 h-4 text-destructive" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{tx.description}</p>
                      <p className="text-xs text-muted-foreground capitalize">{fmtDate(tx.created_at)} · {tx.entry_type} {tx.reference && `· ${tx.reference}`}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-sm font-semibold ${tx.direction === 'credit' ? 'text-success' : 'text-destructive'}`}>
                      {tx.direction === 'credit' ? '+' : '-'}{formatCurrency(Number(tx.amount))}
                    </span>
                    <p className="text-[10px] text-muted-foreground">bal {formatCurrency(Number(tx.balance_after))}</p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No transactions match your search.</p>}
          </div>
        </motion.div>
      </div>

      {/* Deposit */}
      <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Deposit Funds</DialogTitle><DialogDescription>Add money to your ZimScore wallet (mock rail)</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[{ id: "ecocash", label: "EcoCash" }, { id: "bank", label: "Bank" }, { id: "paynow", label: "Paynow" }, { id: "cash", label: "USD Cash" }].map((m) => (
                  <button key={m.id} onClick={() => setMethod(m.id)}
                    className={`py-2 px-3 rounded-lg text-xs font-medium border transition-colors ${method === m.id ? "bg-primary/15 border-primary/40 text-primary" : "bg-secondary border-border text-muted-foreground"}`}>{m.label}</button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Amount (USD)</Label>
              <Input type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} min={1} max={10000} />
              <div className="flex gap-2 flex-wrap">
                {quickAmounts.map(qa => <button key={qa} onClick={() => setAmount(String(qa))} className="px-3 py-1 rounded-full text-xs bg-secondary border border-border hover:border-primary/30 transition-colors">${qa}</button>)}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDepositOpen(false)}>Cancel</Button>
            <Button onClick={handleDeposit} disabled={busy} className="glow-primary">{busy ? "Processing..." : "Deposit"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Withdraw */}
      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Withdraw Funds</DialogTitle><DialogDescription>Transfer from your wallet (1% fee applies)</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Method</Label>
              <div className="grid grid-cols-3 gap-2">
                {[{ id: "ecocash", label: "EcoCash" }, { id: "bank", label: "Bank" }, { id: "cash", label: "Cash" }].map(m => (
                  <button key={m.id} onClick={() => setMethod(m.id)} className={`py-2 px-3 rounded-lg text-xs font-medium border transition-colors ${method === m.id ? "bg-primary/15 border-primary/40 text-primary" : "bg-secondary border-border text-muted-foreground"}`}>{m.label}</button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>{method === "ecocash" ? "Phone Number" : "Account Number"}</Label>
              <Input placeholder={method === "ecocash" ? "077X XXX XXXX" : "Account number"} value={accountRef} onChange={e => setAccountRef(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Amount (USD)</Label>
              <Input type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} min={1} />
              <p className="text-xs text-muted-foreground">Available: {formatCurrency(balance)}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleWithdraw} disabled={busy}>{busy ? "Processing..." : "Withdraw"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Freeze */}
      <Dialog open={freezeOpen} onOpenChange={setFreezeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{walletFrozen ? "Unfreeze Wallet" : "Freeze Wallet"}</DialogTitle>
            <DialogDescription>{walletFrozen ? "Re-enable outgoing transactions." : "Block all outgoing transactions immediately."}</DialogDescription>
          </DialogHeader>
          <div className="py-4 text-center">
            {walletFrozen ? <ShieldOff className="w-12 h-12 text-success mx-auto mb-3" /> : <Shield className="w-12 h-12 text-destructive mx-auto mb-3" />}
            <p className="text-sm text-muted-foreground">{walletFrozen ? "Your wallet is currently frozen." : "Freezing immediately blocks withdrawals, transfers, bids, and payments."}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFreezeOpen(false)}>Cancel</Button>
            <Button variant={walletFrozen ? "default" : "destructive"} onClick={toggleFreeze}>{walletFrozen ? "Unfreeze Wallet" : "Freeze Wallet"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Low-balance alert */}
      <Dialog open={alertOpen} onOpenChange={setAlertOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Set Low-Balance Alert</DialogTitle><DialogDescription>Get notified when your balance falls below a threshold.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Alert Threshold (USD)</Label>
              <Input type="number" placeholder="e.g. 100" value={alertAmount} onChange={e => setAlertAmount(e.target.value)} />
            </div>
            {lowBalanceThreshold && <p className="text-xs text-muted-foreground">Current alert: {formatCurrency(lowBalanceThreshold)}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlertOpen(false)}>Cancel</Button>
            <Button onClick={setAlert}>Set Alert</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
