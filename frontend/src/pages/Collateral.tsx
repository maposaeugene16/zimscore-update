import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Package, Plus, ShieldCheck, ShieldOff, AlertTriangle } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface Asset {
  id: string;
  asset_type: string;
  description: string;
  estimated_value: number;
  serial_number: string | null;
  status: string;
  pledged_to_loan_id: string | null;
  created_at: string;
}

const ASSET_TYPES = ["Vehicle", "Property", "Livestock", "Equipment", "Electronics", "Jewellery", "Other"];

export default function Collateral() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    asset_type: ASSET_TYPES[0],
    description: "",
    estimated_value: "",
    serial_number: "",
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("collateral_assets")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setAssets((data as Asset[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const submit = async () => {
    if (!user) return;
    const value = Number(form.estimated_value);
    if (!form.description.trim() || !value || value <= 0) {
      toast.error("Description and value required");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("collateral_assets").insert({
      user_id: user.id,
      asset_type: form.asset_type,
      description: form.description,
      estimated_value: value,
      serial_number: form.serial_number || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Asset added to registry");
    setOpen(false);
    setForm({ asset_type: ASSET_TYPES[0], description: "", estimated_value: "", serial_number: "" });
    load();
  };

  const release = async (id: string) => {
    const { error } = await supabase
      .from("collateral_assets")
      .update({ status: "released", released_at: new Date().toISOString(), pledged_to_loan_id: null })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Asset released");
    load();
  };

  const statusColor = (s: string) =>
    s === "available" ? "text-success bg-success/10 border-success/20" :
    s === "pledged" ? "text-accent bg-accent/10 border-accent/20" :
    s === "released" ? "text-muted-foreground bg-secondary border-border" :
    "text-destructive bg-destructive/10 border-destructive/20";

  const totalValue = assets.filter(a => a.status !== "released").reduce((s, a) => s + Number(a.estimated_value), 0);
  const pledgedCount = assets.filter(a => a.status === "pledged").length;

  return (
    <AppLayout title={t("collateral.title")}>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold">{t("collateral.title")}</h2>
            <p className="text-sm text-muted-foreground">Register assets you can pledge against loans.</p>
          </div>
          <Button onClick={() => setOpen(true)} className="glow-primary">
            <Plus className="w-4 h-4 mr-2" /> {t("collateral.addAsset")}
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="glass-card p-4">
            <p className="text-xs text-muted-foreground">Total Assets</p>
            <p className="font-display text-2xl font-bold">{assets.length}</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-xs text-muted-foreground">Registry Value</p>
            <p className="font-display text-2xl font-bold">${totalValue.toLocaleString()}</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-xs text-muted-foreground">Pledged</p>
            <p className="font-display text-2xl font-bold text-accent">{pledgedCount}</p>
          </div>
        </div>

        <div className="glass-card p-6">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
          ) : assets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No collateral assets registered yet.</p>
              <p className="text-xs mt-1">Add an asset to use as security for loans.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {assets.map((a) => (
                <motion.div key={a.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between p-4 rounded-lg bg-secondary/30 border border-border hover:bg-secondary/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10"><Package className="w-5 h-5 text-primary" /></div>
                    <div>
                      <p className="font-medium text-sm">{a.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.asset_type}{a.serial_number ? ` · SN: ${a.serial_number}` : ""} · ${Number(a.estimated_value).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded-full border font-medium capitalize ${statusColor(a.status)}`}>
                      {t(`collateral.${a.status}`, a.status)}
                    </span>
                    {a.status === "pledged" && (
                      <Button size="sm" variant="outline" onClick={() => release(a.id)}>
                        <ShieldOff className="w-3 h-3 mr-1" /> Release
                      </Button>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Collateral consent</p>
            By pledging an asset against a loan, you authorise ZimScore and the lender to register an encumbrance on the asset. Released assets become available again automatically when the loan is fully repaid.
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("collateral.addAsset")}</DialogTitle>
            <DialogDescription>Register an asset in your collateral registry.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t("collateral.assetType")}</Label>
              <div className="grid grid-cols-3 gap-2">
                {ASSET_TYPES.map((tp) => (
                  <button key={tp} onClick={() => setForm({ ...form, asset_type: tp })}
                    className={`p-2 rounded-lg text-xs font-medium border transition-colors ${
                      form.asset_type === tp ? "bg-primary text-primary-foreground border-primary" : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                    }`}>
                    {tp}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("collateral.description")}</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g. Toyota Hilux 2018, white, double cab" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t("collateral.estimatedValue")} (USD)</Label>
                <Input type="number" value={form.estimated_value} onChange={(e) => setForm({ ...form, estimated_value: e.target.value })} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>Serial / Reg #</Label>
                <Input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} placeholder="Optional" />
              </div>
            </div>
            <Button onClick={submit} disabled={saving} className="w-full">
              {saving ? "Saving..." : <><ShieldCheck className="w-4 h-4 mr-2" /> Register Asset</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
