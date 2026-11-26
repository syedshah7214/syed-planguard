import { BookOpen, FileSearch, LayoutDashboard, ListChecks, ReceiptText, type LucideIcon } from "lucide-react";

export interface NavItem { path: string; label: string; icon: LucideIcon; keywords: string }
export interface NavGroup { label: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  { label: "Guard", items: [
    { path: "/", label: "Overview", icon: LayoutDashboard, keywords: "home dashboard history stats" },
    { path: "/analyze", label: "Analyze a Plan", icon: FileSearch, keywords: "upload paste sample terraform run" },
  ] },
  { label: "Policy", items: [
    { path: "/policies", label: "Policy Rules", icon: ListChecks, keywords: "rules security cost reliability" },
    { path: "/pricing", label: "Price Table", icon: ReceiptText, keywords: "cost prices aws estimate" },
  ] },
  { label: "Platform", items: [
    { path: "/ci", label: "CI Integration", icon: BookOpen, keywords: "github actions cli docs pipeline" },
  ] },
];
export const ALL_NAV = NAV.flatMap((g) => g.items);
