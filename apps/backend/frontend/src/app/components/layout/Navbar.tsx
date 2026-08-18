import React from "react";
import { Link, useLocation } from "react-router-dom";
import { clsx } from "clsx";
import { Badge } from "../ui";

export function Navbar() {
  const location = useLocation();

  const navItems = [
    { path: "/", label: "Product" },
    { path: "/#how-it-works", label: "How it Works" },
    { path: "/#mvp", label: "MVP" },
    { path: "/docs", label: "Docs" },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#050816]/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-600 to-secondary-600 flex items-center justify-center font-bold text-xl shadow-lg shadow-primary-600/30">
              D
            </div>
            <span className="text-xl font-bold">D-Scope</span>
          </Link>

          {/* Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={clsx(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  location.pathname === item.path
                    ? "text-white bg-white/10"
                    : "text-slate-400 hover:text-white hover:bg-white/5",
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Badges + CTA */}
          <div className="flex items-center gap-3">
            <Badge tone="violet">Aztec-first</Badge>
            <Badge tone="amber">Testnet MVP</Badge>
            <Link to="/create">
              <button className="ml-4 px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary-600 to-secondary-600 text-white font-semibold hover:from-primary-500 hover:to-secondary-500 transition-all shadow-lg shadow-primary-600/30">
                Open App
              </button>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
