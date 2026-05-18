import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Wallet, BarChart3, Users, Building2,
  Rocket, Shield, LogOut, X, TrendingUp, Bell, Landmark, Smartphone, Briefcase, Package
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";

const navItems = [
  { labelKey: "nav.dashboard", icon: LayoutDashboard, path: "/dashboard" },
  { labelKey: "nav.wallet", icon: Wallet, path: "/wallet" },
  { labelKey: "nav.creditScore", icon: BarChart3, path: "/score" },
  { labelKey: "nav.p2p", icon: Users, path: "/p2p" },
  { labelKey: "nav.collateral", icon: Package, path: "/collateral" },
  { labelKey: "nav.smeHub", icon: Building2, path: "/sme" },
  { labelKey: "nav.crowdfunding", icon: Rocket, path: "/crowdfunding" },
  { labelKey: "nav.marketplace", icon: Landmark, path: "/mfi" },
  { labelKey: "nav.ecocashUpload", icon: Smartphone, path: "/ecocash-upload" },
  { labelKey: "nav.fiPortal", icon: Briefcase, path: "/fi", fiOnly: true },
  { labelKey: "nav.notifications", icon: Bell, path: "/notifications" },
  { labelKey: "nav.admin", icon: Shield, path: "/admin", adminOnly: true },
];

interface AppSidebarProps {
  open: boolean;
  onClose: () => void;
}

export function AppSidebar({ open, onClose }: AppSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, isAdmin, fi } = useAuth();
  const showFI = !!fi; // show portal as soon as registered (page handles pending/rejected)

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden" onClick={onClose} />
      )}

      <aside
        className={cn(
          "fixed top-0 left-0 h-full z-50 w-64 sidebar-gradient border-r border-border flex flex-col transition-transform duration-300 lg:translate-x-0 lg:static lg:z-auto",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="p-6 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center glow-primary">
              <TrendingUp className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-display text-xl font-bold text-foreground">ZimScore</span>
          </Link>
          <button onClick={onClose} className="lg:hidden text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 space-y-1">
          {navItems.filter(item => {
            if ((item as any).adminOnly) return isAdmin;
            if ((item as any).fiOnly) return showFI;
            return true;
          }).map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  active
                    ? "bg-primary/15 text-primary border border-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                )}
              >
                <item.icon className={cn("w-5 h-5", active && "text-primary")} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-border">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors w-full"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
