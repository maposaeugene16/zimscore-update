import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Building2, FileText, DollarSign, Plus, Send, Download, TrendingUp, TrendingDown, QrCode, MapPin, Trash2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { formatCurrency, formatDate } from "@/lib/mock-data";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import jsPDF from "jspdf";

type LineItem = { description: string; qty: number; price: number };
type Invoice = {
  id: string; invoice_number: string; client_name: string; client_contact: string | null;
  status: string; line_items: LineItem[]; subtotal: number; tax: number; total: number;
  due_date: string | null; notes: string | null; paid_at: string | null; created_at: string;
};
type Quotation = {
  id: string; quotation_number: string; client_name: string; client_contact: string | null;
  status: string; line_items: LineItem[]; subtotal: number; tax: number; total: number;
  valid_until: string | null; notes: string | null; created_at: string;
};

type DocType = "invoice" | "quotation";

export default function SMEHub() {
  const { user } = useAuth();
  const [mainTab, setMainTab] = useState("invoices");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const [bizName, setBizName] = useState("Moyo Electronics");
  const [bizCategory, setBizCategory] = useState("Retail");
  const [bizDesc, setBizDesc] = useState("Quality electronics and accessories in Harare CBD");
  const [bizLocation, setBizLocation] = useState("Harare");
  const [bizProducts, setBizProducts] = useState("Electronics, Accessories, Repairs");

  const [docOpen, setDocOpen] = useState<DocType | null>(null);
  const [docClient, setDocClient] = useState("");
  const [docContact, setDocContact] = useState("");
  const [docNotes, setDocNotes] = useState("");
  const [docDueOrValid, setDocDueOrValid] = useState("");
  const [docItems, setDocItems] = useState<LineItem[]>([{ description: "", qty: 1, price: 0 }]);
  const [docTaxPct, setDocTaxPct] = useState("0");

  const load = async () => {
    if (!user) return;
    const [{ data: inv }, { data: qu }] = await Promise.all([
      supabase.from("invoices").select("*").eq("sme_user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("quotations").select("*").eq("sme_user_id", user.id).order("created_at", { ascending: false }),
    ]);
    setInvoices((inv ?? []) as any);
    setQuotations((qu ?? []) as any);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  const subtotal = docItems.reduce((s, i) => s + Number(i.qty) * Number(i.price), 0);
  const tax = subtotal * (Number(docTaxPct) / 100);
  const total = subtotal + tax;

  const resetForm = () => {
    setDocClient(""); setDocContact(""); setDocNotes(""); setDocDueOrValid("");
    setDocItems([{ description: "", qty: 1, price: 0 }]); setDocTaxPct("0");
  };

  const saveDoc = async () => {
    if (!user || !docOpen) return;
    if (!docClient.trim() || docItems.some(i => !i.description.trim() || i.price <= 0)) {
      toast.error("Fill in client and all line items");
      return;
    }
    const num = `${docOpen === "invoice" ? "INV" : "QUO"}-${Date.now().toString().slice(-6)}`;
    const payload: any = {
      sme_user_id: user.id,
      client_name: docClient,
      client_contact: docContact || null,
      line_items: docItems,
      subtotal, tax, total,
      notes: docNotes || null,
    };
    if (docOpen === "invoice") {
      payload.invoice_number = num;
      payload.due_date = docDueOrValid || null;
      const { error } = await supabase.from("invoices").insert(payload);
      if (error) { toast.error(error.message); return; }
    } else {
      payload.quotation_number = num;
      payload.valid_until = docDueOrValid || null;
      const { error } = await supabase.from("quotations").insert(payload);
      if (error) { toast.error(error.message); return; }
    }
    toast.success(`${docOpen === "invoice" ? "Invoice" : "Quotation"} ${num} created`);
    setDocOpen(null); resetForm(); load();
  };

  const updateInvoiceStatus = async (id: string, status: string) => {
    const patch: any = { status };
    if (status === "paid") patch.paid_at = new Date().toISOString();
    const { error } = await supabase.from("invoices").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Invoice marked ${status}`);
    load();
  };

  const removeDoc = async (type: DocType, id: string) => {
    const { error } = await supabase.from(type === "invoice" ? "invoices" : "quotations").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    load();
  };

  const exportPdf = (doc: Invoice | Quotation, type: DocType) => {
    const pdf = new jsPDF();
    const num = (doc as any).invoice_number || (doc as any).quotation_number;
    pdf.setFontSize(20); pdf.text(bizName, 20, 25);
    pdf.setFontSize(10); pdf.setTextColor(120);
    pdf.text(`${bizLocation} · ${bizCategory}`, 20, 32);

    pdf.setFontSize(16); pdf.setTextColor(0);
    pdf.text(type === "invoice" ? "INVOICE" : "QUOTATION", 150, 25);
    pdf.setFontSize(10); pdf.text(`# ${num}`, 150, 32);
    pdf.text(`Date: ${formatDate(doc.created_at)}`, 150, 38);
    const dateLine = type === "invoice" ? (doc as Invoice).due_date : (doc as Quotation).valid_until;
    if (dateLine) pdf.text(`${type === "invoice" ? "Due" : "Valid until"}: ${dateLine}`, 150, 44);

    pdf.setFontSize(11); pdf.text("Bill To:", 20, 55);
    pdf.setFontSize(10); pdf.text(doc.client_name, 20, 62);
    if (doc.client_contact) pdf.text(doc.client_contact, 20, 68);

    let y = 85;
    pdf.setFontSize(10); pdf.setFillColor(230, 230, 230);
    pdf.rect(20, y - 5, 170, 8, "F");
    pdf.text("Description", 22, y); pdf.text("Qty", 130, y); pdf.text("Price", 150, y); pdf.text("Total", 175, y);
    y += 8;
    (doc.line_items as LineItem[]).forEach(li => {
      pdf.text(String(li.description).slice(0, 60), 22, y);
      pdf.text(String(li.qty), 130, y);
      pdf.text(`$${Number(li.price).toFixed(2)}`, 150, y);
      pdf.text(`$${(Number(li.qty) * Number(li.price)).toFixed(2)}`, 175, y);
      y += 7;
    });
    y += 5;
    pdf.text(`Subtotal: $${Number(doc.subtotal).toFixed(2)}`, 150, y); y += 6;
    pdf.text(`Tax: $${Number(doc.tax).toFixed(2)}`, 150, y); y += 6;
    pdf.setFontSize(12); pdf.text(`Total: $${Number(doc.total).toFixed(2)}`, 150, y);
    if (doc.notes) { y += 12; pdf.setFontSize(9); pdf.setTextColor(120); pdf.text(`Notes: ${doc.notes}`, 20, y); }
    pdf.save(`${num}.pdf`);
  };

  const totalRevenue = invoices.filter(i => i.status === "paid").reduce((s, i) => s + Number(i.total), 0);
  const totalOutstanding = invoices.filter(i => i.status === "sent").reduce((s, i) => s + Number(i.total), 0);

  const statusColors: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    sent: "bg-accent/15 text-accent",
    paid: "bg-success/15 text-success",
    accepted: "bg-success/15 text-success",
    rejected: "bg-destructive/15 text-destructive",
    expired: "bg-muted text-muted-foreground",
  };

  return (
    <AppLayout title="SME Hub">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h2 className="font-display text-2xl font-bold">{bizName}</h2>
            <p className="text-muted-foreground text-sm flex items-center gap-1"><MapPin className="w-3 h-3" /> {bizLocation} · {bizCategory}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setProfileOpen(true)}><Building2 className="w-4 h-4 mr-2" /> Profile</Button>
            <Button variant="outline" onClick={() => setQrOpen(true)}><QrCode className="w-4 h-4 mr-2" /> QR Pay</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[
            { label: "Revenue (paid)", value: formatCurrency(totalRevenue), icon: TrendingUp, color: "text-success" },
            { label: "Outstanding", value: formatCurrency(totalOutstanding), icon: TrendingDown, color: "text-accent" },
            { label: "Invoices", value: invoices.length.toString(), icon: FileText, color: "text-primary" },
            { label: "Quotations", value: quotations.length.toString(), icon: DollarSign, color: "text-primary" },
          ].map(s => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-secondary ${s.color}`}><s.icon className="w-5 h-5" /></div>
              <div><p className="text-xs text-muted-foreground">{s.label}</p><p className="font-display font-bold">{s.value}</p></div>
            </motion.div>
          ))}
        </div>

        <Tabs value={mainTab} onValueChange={setMainTab}>
          <TabsList>
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
            <TabsTrigger value="quotations">Quotations</TabsTrigger>
          </TabsList>

          <TabsContent value="invoices" className="space-y-3 mt-4">
            <Button onClick={() => { setDocOpen("invoice"); resetForm(); }}><Plus className="w-4 h-4 mr-2" /> New Invoice</Button>
            {invoices.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No invoices yet.</p> :
              invoices.map(inv => (
                <div key={inv.id} className="p-4 rounded-lg bg-secondary/30 border border-border flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{inv.invoice_number} — {inv.client_name}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(inv.created_at)} {inv.due_date ? `· due ${inv.due_date}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="font-display font-bold">{formatCurrency(Number(inv.total))}</p>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[inv.status] || "bg-secondary"}`}>{inv.status}</span>
                    <Button size="sm" variant="outline" onClick={() => exportPdf(inv, "invoice")}><Download className="w-3 h-3 mr-1" /> PDF</Button>
                    {inv.status === "draft" && <Button size="sm" variant="outline" onClick={() => updateInvoiceStatus(inv.id, "sent")}><Send className="w-3 h-3 mr-1" /> Send</Button>}
                    {inv.status === "sent" && <Button size="sm" onClick={() => updateInvoiceStatus(inv.id, "paid")}>Mark Paid</Button>}
                    <Button size="sm" variant="ghost" onClick={() => removeDoc("invoice", inv.id)}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </div>
              ))}
          </TabsContent>

          <TabsContent value="quotations" className="space-y-3 mt-4">
            <Button onClick={() => { setDocOpen("quotation"); resetForm(); }}><Plus className="w-4 h-4 mr-2" /> New Quotation</Button>
            {quotations.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No quotations yet.</p> :
              quotations.map(q => (
                <div key={q.id} className="p-4 rounded-lg bg-secondary/30 border border-border flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{q.quotation_number} — {q.client_name}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(q.created_at)} {q.valid_until ? `· valid until ${q.valid_until}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="font-display font-bold">{formatCurrency(Number(q.total))}</p>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[q.status] || "bg-secondary"}`}>{q.status}</span>
                    <Button size="sm" variant="outline" onClick={() => exportPdf(q, "quotation")}><Download className="w-3 h-3 mr-1" /> PDF</Button>
                    <Button size="sm" variant="ghost" onClick={() => removeDoc("quotation", q.id)}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </div>
              ))}
          </TabsContent>
        </Tabs>
      </div>

      {/* Create invoice / quotation dialog */}
      <Dialog open={!!docOpen} onOpenChange={open => !open && setDocOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{docOpen === "invoice" ? "New Invoice" : "New Quotation"}</DialogTitle>
            <DialogDescription>{docOpen === "invoice" ? "Bill a client" : "Provide a quote"} — exports as a branded PDF.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Client Name</Label><Input value={docClient} onChange={e => setDocClient(e.target.value)} placeholder="Acme Co." /></div>
              <div className="space-y-2"><Label>Client Contact</Label><Input value={docContact} onChange={e => setDocContact(e.target.value)} placeholder="email / phone" /></div>
            </div>
            <div className="space-y-2"><Label>{docOpen === "invoice" ? "Due Date" : "Valid Until"}</Label><Input type="date" value={docDueOrValid} onChange={e => setDocDueOrValid(e.target.value)} /></div>

            <div className="space-y-2">
              <Label>Line Items</Label>
              {docItems.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2">
                  <Input className="col-span-6" placeholder="Description" value={it.description}
                    onChange={e => setDocItems(items => items.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))} />
                  <Input className="col-span-2" type="number" placeholder="Qty" value={it.qty}
                    onChange={e => setDocItems(items => items.map((x, i) => i === idx ? { ...x, qty: Number(e.target.value) } : x))} />
                  <Input className="col-span-3" type="number" placeholder="Price" value={it.price}
                    onChange={e => setDocItems(items => items.map((x, i) => i === idx ? { ...x, price: Number(e.target.value) } : x))} />
                  <Button className="col-span-1" size="sm" variant="ghost" onClick={() => setDocItems(items => items.filter((_, i) => i !== idx))}><Trash2 className="w-3 h-3" /></Button>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => setDocItems(items => [...items, { description: "", qty: 1, price: 0 }])}><Plus className="w-3 h-3 mr-1" /> Add line</Button>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-2 border-t border-border">
              <div className="space-y-2"><Label>Tax (%)</Label><Input type="number" value={docTaxPct} onChange={e => setDocTaxPct(e.target.value)} /></div>
              <div className="space-y-2"><Label>Subtotal</Label><Input value={subtotal.toFixed(2)} readOnly /></div>
              <div className="space-y-2"><Label className="text-success">Total</Label><Input value={total.toFixed(2)} readOnly className="font-bold" /></div>
            </div>

            <div className="space-y-2"><Label>Notes</Label><Textarea value={docNotes} onChange={e => setDocNotes(e.target.value)} rows={2} placeholder="Payment terms, bank details..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDocOpen(null)}>Cancel</Button>
            <Button onClick={saveDoc}>Save {docOpen === "invoice" ? "Invoice" : "Quotation"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Business Profile</DialogTitle><DialogDescription>Your SME profile.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Business Name</Label><Input value={bizName} onChange={e => setBizName(e.target.value)} /></div>
            <div className="space-y-2"><Label>Category</Label>
              <select value={bizCategory} onChange={e => setBizCategory(e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option>Retail</option><option>Services</option><option>Agriculture</option><option>Manufacturing</option><option>Technology</option>
              </select>
            </div>
            <div className="space-y-2"><Label>Description</Label><Textarea value={bizDesc} onChange={e => setBizDesc(e.target.value)} rows={2} /></div>
            <div className="space-y-2"><Label>Location</Label><Input value={bizLocation} onChange={e => setBizLocation(e.target.value)} /></div>
            <div className="space-y-2"><Label>Products/Services</Label><Input value={bizProducts} onChange={e => setBizProducts(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProfileOpen(false)}>Cancel</Button>
            <Button onClick={() => { toast.success("Profile updated"); setProfileOpen(false); }}>Save Profile</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>QR Payment Link</DialogTitle><DialogDescription>Share with customers to receive payments to your wallet.</DialogDescription></DialogHeader>
          <div className="flex flex-col items-center py-6">
            <div className="w-48 h-48 bg-white rounded-xl flex items-center justify-center">
              <QrCode className="w-32 h-32 text-black" />
            </div>
            <p className="text-sm text-muted-foreground mt-4">Wallet: ZIM-WAL-{user?.id?.slice(0, 6).toUpperCase()}</p>
            <Button variant="outline" className="mt-2" onClick={() => { navigator.clipboard.writeText(`https://zimscore.app/pay/${user?.id?.slice(0, 8)}`); toast.success("Payment link copied"); }}>Copy Link</Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
