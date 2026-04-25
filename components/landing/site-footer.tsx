import Link from "next/link";
import { Mail, Globe, Send } from "lucide-react";
import Image from "next/image";


export function SiteFooter() {
  return (
    <footer className="bg-black text-white py-16 md:py-24 border-t border-white/10">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 md:gap-8 mb-16">

          <div className="md:col-span-1">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 group">
              <Image src="/zakbislogo.png" alt="Zakbis Logo" width={68} height={68} objectFit="cover" />
            </Link>
            <p className="text-sm text-slate-400">
              The peer-to-peer delivery network.
            </p>
          </div>

          <div>
            <h4 className="font-bold text-white mb-4">Product</h4>
            <ul className="space-y-3">
              <li><a href="#" className="text-sm text-slate-400 hover:text-white transition-colors">How it Works</a></li>
              <li><a href="#" className="text-sm text-slate-400 hover:text-white transition-colors">Pricing</a></li>
              <li><a href="#" className="text-sm text-slate-400 hover:text-white transition-colors">Security</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-white mb-4">Legal</h4>
            <ul className="space-y-3">
              <li><a href="#" className="text-sm text-slate-400 hover:text-white transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="text-sm text-slate-400 hover:text-white transition-colors">Terms of Service</a></li>
              <li><a href="#" className="text-sm text-slate-400 hover:text-white transition-colors">Guidelines</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-white mb-4">Support</h4>
            <ul className="space-y-3">
              <li><a href="#" className="text-sm text-slate-400 hover:text-white transition-colors">Help Center</a></li>
              <li><a href="#" className="text-sm text-slate-400 hover:text-white transition-colors">Contact</a></li>
              <li><a href="#" className="text-sm text-slate-400 hover:text-white transition-colors">Status</a></li>
            </ul>
          </div>

        </div>

        <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-sm text-slate-500">
            © {new Date().getFullYear()} Zakbis Inc.
          </div>

          <div className="flex items-center gap-6 text-slate-400">
            <a href="#" className="hover:text-white transition-colors"><Mail size={18} /></a>
            <a href="#" className="hover:text-white transition-colors"><Globe size={18} /></a>
            <a href="#" className="hover:text-white transition-colors"><Send size={18} /></a>
          </div>
        </div>
      </div>
    </footer>
  );
}
