import { useState } from "react";
import { motion } from "framer-motion";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { AppLayout } from "@/components/layout/AppLayout";
import { CreditScoreGauge } from "@/components/dashboard/CreditScoreGauge";
import { mockUser, creditBreakdown, monthlyScoreHistory, scoreTips, scoreConfidence, formatDate } from "@/lib/mock-data";
import { TrendingUp, Lightbulb, Upload, FileText, CheckCircle, Info, AlertCircle, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const documentTypes = [
  { id: "payslip", label: "Payslip", formats: "PDF / Image", icon: FileText },
  { id: "bank_statement", label: "Bank Statement", formats: "PDF / CSV", icon: FileText },
  { id: "ecocash", label: "EcoCash History", formats: "CSV", icon: FileText },
  { id: "utility", label: "Utility Bill", formats: "PDF / Image", icon: FileText },
];

export default function ScorePage() {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, File | null>>({});
  const [processing, setProcessing] = useState(false);
  const [manualBudgetOpen, setManualBudgetOpen] = useState(false);
  const [monthlyIncome, setMonthlyIncome] = useState("");
  const [monthlyExpenses, setMonthlyExpenses] = useState("");
  const [monthlySavings, setMonthlySavings] = useState("");

  const handleFileUpload = (docType: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("File must be under 10MB"); return; }
    setUploadedDocs(prev => ({ ...prev, [docType]: file }));
    toast.success(`${file.name} uploaded`);
  };

  const handleProcessDocuments = () => {
    const count = Object.values(uploadedDocs).filter(Boolean).length;
    if (count === 0) { toast.error("Please upload at least one document"); return; }
    setProcessing(true);
    setTimeout(() => {
      setProcessing(false);
      toast.success("Documents processed via OCR. Score updated!", { description: `${count} document(s) analysed in 12 seconds` });
      setUploadOpen(false);
      setUploadedDocs({});
    }, 3000);
  };

  const handleManualBudget = () => {
    if (!monthlyIncome || !monthlyExpenses) { toast.error("Please enter income and expenses"); return; }
    toast.success("Budget data submitted. Score will update within 60 seconds.");
    setManualBudgetOpen(false);
    setMonthlyIncome(""); setMonthlyExpenses(""); setMonthlySavings("");
  };

  const zimScore = mockUser.creditScore;
  const band = zimScore >= 750 ? "Excellent" : zimScore >= 650 ? "Good" : zimScore >= 550 ? "Fair" : zimScore >= 400 ? "Poor" : "Very Poor";
  const bandColor = zimScore >= 750 ? "text-success" : zimScore >= 650 ? "text-primary" : zimScore >= 550 ? "text-accent" : "text-destructive";

  return (
    <AppLayout title="Credit Score">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Top Actions */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h2 className="font-display text-2xl font-bold">Your Zimscore</h2>
            <p className="text-muted-foreground text-sm">AI-powered credit assessment</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setManualBudgetOpen(true)}>
              <BarChart3 className="w-4 h-4 mr-2" /> Manual Budget
            </Button>
            <Button onClick={() => setUploadOpen(true)} className="glow-primary">
              <Upload className="w-4 h-4 mr-2" /> Upload Documents
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Gauge + Confidence */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6 flex flex-col items-center">
            <h3 className="font-display text-lg font-semibold mb-4">Your Credit Score</h3>
            <CreditScoreGauge score={mockUser.creditScore} maxScore={mockUser.maxScore} />
            <div className="flex items-center gap-2 mt-3">
              <span className={`font-display font-bold text-lg ${bandColor}`}>{band}</span>
              <div className="group relative">
                <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-popover border border-border rounded-lg text-xs text-muted-foreground w-48 hidden group-hover:block z-10">
                  Zimscore ranges from 0–850. Higher scores unlock better loan terms and lower interest rates.
                </div>
              </div>
            </div>
            {/* Confidence Level */}
            <div className="mt-4 w-full p-3 rounded-lg bg-secondary/40 border border-border">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground flex items-center gap-1">
                  Confidence Level
                  <div className="group relative inline-block">
                    <Info className="w-3 h-3 cursor-help" />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-popover border border-border rounded-lg text-xs w-44 hidden group-hover:block z-10">
                      Based on months of data available. More data = higher confidence.
                    </div>
                  </div>
                </span>
                <span className="font-bold">{scoreConfidence}%</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${scoreConfidence}%` }} transition={{ duration: 1 }} />
              </div>
            </div>
            <p className="text-center text-xs text-muted-foreground mt-2">Model: Phase 1 (Rule-Based) · Last updated: {formatDate("2024-01-15")}</p>
          </motion.div>

          {/* Score History with annotations */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h3 className="font-display text-lg font-semibold">Score History</h3>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={monthlyScoreHistory}>
                <XAxis dataKey="month" stroke="hsl(215, 20%, 55%)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis domain={[650, 800]} stroke="hsl(215, 20%, 55%)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: "hsl(222, 40%, 10%)", border: "1px solid hsl(222, 30%, 18%)", borderRadius: "8px", color: "hsl(210, 40%, 96%)" }}
                  formatter={(value: number) => [value, "Zimscore"]}
                  labelFormatter={(label: string) => {
                    const point = monthlyScoreHistory.find(p => p.month === label);
                    return point?.annotation ? `${label} — ${point.annotation}` : label;
                  }}
                />
                <Line type="monotone" dataKey="score" stroke="hsl(224, 76%, 48%)" strokeWidth={2.5} dot={{ fill: "hsl(224, 76%, 48%)", r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
            {/* Annotations */}
            <div className="mt-3 space-y-1">
              {monthlyScoreHistory.filter(p => p.annotation).slice(-3).map((p) => (
                <div key={p.month} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="w-8 font-medium">{p.month}</span>
                  <span className="text-foreground">{p.score}</span>
                  <span>— {p.annotation}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Score Breakdown - SRS Phase 1 Formula */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg font-semibold">Score Breakdown</h3>
            <span className="text-xs text-muted-foreground px-2 py-1 rounded bg-secondary border border-border">Phase 1 Formula</span>
          </div>
          <div className="space-y-4">
            {creditBreakdown.map((item) => (
              <div key={item.label} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-1">
                    {item.label}
                    <span className="text-muted-foreground">({item.weight}%)</span>
                    <div className="group relative inline-block">
                      <Info className="w-3 h-3 text-muted-foreground cursor-help" />
                      <div className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-popover border border-border rounded-lg text-xs w-48 hidden group-hover:block z-10">
                        {item.label === "Income Stability" && "How consistent your monthly income is over time."}
                        {item.label === "Expense Ratio" && "The percentage of your income that you spend each month."}
                        {item.label === "Payment History" && "Your track record of paying bills and loans on time."}
                        {item.label === "Savings Behaviour" && "How much you save relative to your income each month."}
                      </div>
                    </div>
                  </span>
                  <span className="font-semibold">{item.score}/100</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <motion.div className="h-full rounded-full" style={{ background: item.color }} initial={{ width: 0 }} animate={{ width: `${item.score}%` }} transition={{ duration: 1.5 }} />
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Personalized Improvement Tips - SCR-FR-009/010/013 */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="w-5 h-5 text-accent" />
            <h3 className="font-display text-lg font-semibold">Personalised Improvement Tips</h3>
          </div>
          <div className="space-y-3">
            {scoreTips.map((tip, i) => (
              <div key={i} className={`p-4 rounded-lg border ${tip.completed ? "bg-success/5 border-success/20" : "bg-secondary/40 border-border"} flex items-start gap-3`}>
                {tip.completed ? (
                  <CheckCircle className="w-5 h-5 text-success mt-0.5 shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-accent mt-0.5 shrink-0" />
                )}
                <div className="flex-1">
                  <p className={`text-sm ${tip.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>{tip.tip}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1 text-success font-medium">{tip.impact}</span>
                    <span>{tip.timeframe}</span>
                    <span className="px-1.5 py-0.5 rounded bg-secondary border border-border">{tip.subScore}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Document Upload Dialog - SCR-FR-001 */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload Financial Documents</DialogTitle>
            <DialogDescription>Upload documents to improve your Zimscore accuracy. Documents are processed via OCR within 60 seconds.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {/* Progress indicator - UX-FR-004 */}
            <div className="p-3 rounded-lg bg-secondary/30 border border-border text-sm">
              <p className="font-medium mb-2">{Object.values(uploadedDocs).filter(Boolean).length} of {documentTypes.length} documents uploaded</p>
              <div className="flex gap-1">
                {documentTypes.map((doc) => (
                  <div key={doc.id} className={`flex-1 h-1.5 rounded-full ${uploadedDocs[doc.id] ? "bg-success" : "bg-secondary"}`} />
                ))}
              </div>
            </div>
            {documentTypes.map((doc) => (
              <label key={doc.id} className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${uploadedDocs[doc.id] ? "bg-success/5 border-success/30" : "bg-secondary/30 border-border hover:border-primary/30"}`}>
                <div className="flex items-center gap-3">
                  <doc.icon className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{doc.label}</p>
                    <p className="text-xs text-muted-foreground">{doc.formats}</p>
                  </div>
                </div>
                {uploadedDocs[doc.id] ? (
                  <CheckCircle className="w-5 h-5 text-success" />
                ) : (
                  <span className="text-xs text-primary">Upload</span>
                )}
                <input type="file" accept=".pdf,.csv,.jpg,.jpeg,.png" className="hidden" onChange={handleFileUpload(doc.id)} />
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button onClick={handleProcessDocuments} disabled={processing} className="glow-primary">
              {processing ? "Processing..." : "Process Documents"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Budget Entry Dialog */}
      <Dialog open={manualBudgetOpen} onOpenChange={setManualBudgetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manual Budget Entry</DialogTitle>
            <DialogDescription>Enter your monthly financial data to calculate your score.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Monthly Income (USD)</Label><input type="number" placeholder="0.00" value={monthlyIncome} onChange={e => setMonthlyIncome(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm outline-none focus:border-primary" /></div>
            <div className="space-y-2"><Label>Monthly Expenses (USD)</Label><input type="number" placeholder="0.00" value={monthlyExpenses} onChange={e => setMonthlyExpenses(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm outline-none focus:border-primary" /></div>
            <div className="space-y-2"><Label>Monthly Savings (USD)</Label><input type="number" placeholder="0.00" value={monthlySavings} onChange={e => setMonthlySavings(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm outline-none focus:border-primary" /></div>
            {monthlyIncome && monthlyExpenses && (
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm">
                <p className="text-muted-foreground">Expense Ratio: <span className="font-bold text-foreground">{((Number(monthlyExpenses) / Number(monthlyIncome)) * 100).toFixed(0)}%</span></p>
                <p className="text-xs text-muted-foreground mt-1">Keep below 60% for optimal scoring</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualBudgetOpen(false)}>Cancel</Button>
            <Button onClick={handleManualBudget}>Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
