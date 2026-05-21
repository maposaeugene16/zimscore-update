import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Download, Trash2, Shield, AlertTriangle, MessageSquareWarning, Loader2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

interface DisputeRow {
  id: string; dispute_type: string; subject: string; status: string;
  admin_response: string | null; created_at: string;
}

export default function Privacy() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [dType, setDType] = useState("loan");
  const [dSubject, setDSubject] = useState("");
  const [dDesc, setDDesc] = useState("");
  const [disputes, setDisputes] = useState<DisputeRow[]>([]);

  const loadDisputes = async () => {
    if (!user) return;
    const { data } = await supabase.from("disputes").select("*")
      .eq("complainant_id", user.id).order("created_at", { ascending: false });
    setDisputes((data ?? []) as DisputeRow[]);
  };
  useEffect(() => { loadDisputes(); /* eslint-disable-next-line */ }, [user?.id]);

  const exportData = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("export_my_data");
    setBusy(false);
    if (error) return toast.error(error.message);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `zimscore-data-${new Date().toISOString().slice(0,10)}.json`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Your data export was downloaded");
  };

  const deleteAccount = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("delete_my_account", { _confirm: confirmText });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Account anonymised. Signing out…");
    setTimeout(async () => { await signOut(); navigate("/login"); }, 1200);
  };

  const submitDispute = async () => {
    if (!dSubject.trim() || !dDesc.trim()) return toast.error("Subject and description required");
    setBusy(true);
    const { error } = await supabase.rpc("raise_dispute", {
      _dispute_type: dType, _subject: dSubject, _description: dDesc,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Dispute filed — an admin will review shortly");
    setDisputeOpen(false); setDSubject(""); setDDesc("");
    loadDisputes();
  };

  const statusColor = (s: string) =>
    s === "resolved" ? "bg-success/15 text-success" :
    s === "investigating" ? "bg-primary/15 text-primary" :
    s === "closed" ? "bg-muted text-muted-foreground" :
    "bg-accent/15 text-accent";

  return (
    <AppLayout title="Privacy & Data">
      <div className="max-w-4xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6 space-y-3">
          <div className="flex items-center gap-2"><Shield className="w-5 h-5 text-primary" /><h2 className="font-display text-lg font-semibold">Your Data Rights</h2></div>
          <p className="text-sm text-muted-foreground">
            You have the right to access a portable copy of your personal data and to request deletion of your account at any time.
          </p>
          <div className="grid sm:grid-cols-2 gap-3 pt-2">
            <Button onClick={exportData} disabled={busy} variant="outline">
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              Export my data (JSON)
            </Button>
            <Button onClick={() => setDeleteOpen(true)} variant="destructive">
              <Trash2 className="w-4 h-4 mr-2" /> Delete my account
            </Button>
          </div>
          <p className="text-xs text-muted-foreground pt-2">
            Note: ledger entries are retained anonymised for regulatory audit. Personal identifiers are wiped on deletion.
          </p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><MessageSquareWarning className="w-5 h-5 text-accent" /><h2 className="font-display text-lg font-semibold">My Disputes</h2></div>
            <Button onClick={() => setDisputeOpen(true)}>File a dispute</Button>
          </div>
          {disputes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">You have no open disputes.</p>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Subject</TableHead><TableHead>Type</TableHead>
                <TableHead>Status</TableHead><TableHead>Admin response</TableHead><TableHead>Date</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {disputes.map(d => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.subject}</TableCell>
                    <TableCell className="capitalize">{d.dispute_type}</TableCell>
                    <TableCell><span className={`px-2 py-0.5 rounded-full text-xs ${statusColor(d.status)}`}>{d.status}</span></TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[240px] truncate">{d.admin_response || "—"}</TableCell>
                    <TableCell className="text-xs">{new Date(d.created_at).toLocaleDateString("en-GB")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </motion.div>
      </div>

      {/* Delete account confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-destructive" /> Permanent Account Deletion</DialogTitle>
            <DialogDescription>
              This anonymises your profile, freezes your wallet and revokes all share links. Ledger rows are kept for compliance but lose your name and identifiers. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Type <span className="font-mono font-bold">DELETE</span> to confirm</Label>
            <Input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="DELETE" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={confirmText !== "DELETE" || busy} onClick={deleteAccount}>
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Delete forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dispute dialog */}
      <Dialog open={disputeOpen} onOpenChange={setDisputeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>File a dispute</DialogTitle>
            <DialogDescription>An admin will respond within 72 hours.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={dType} onValueChange={setDType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="loan">Loan / P2P</SelectItem>
                  <SelectItem value="campaign">Crowdfunding campaign</SelectItem>
                  <SelectItem value="wallet">Wallet / transaction</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Subject</Label>
              <Input value={dSubject} onChange={e => setDSubject(e.target.value)} placeholder="Short summary" />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea rows={4} value={dDesc} onChange={e => setDDesc(e.target.value)} placeholder="Describe the issue, dates and amounts" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisputeOpen(false)}>Cancel</Button>
            <Button onClick={submitDispute} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
