import Link from "next/link";
import { Mail, Globe, Send } from "lucide-react";
import Image from "next/image";


export function SiteFooter() {
  return (
    <footer className="w-full py-6 border-t border-gray-100 mt-20 bg-gray-50/10">
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
        <div className="text-sm text-slate-500">© {new Date().getFullYear()} Zakbis</div>
        <div className="text-sm text-slate-500">Built with care.</div>
      </div>
    </footer>
  );
}
