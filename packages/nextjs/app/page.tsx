"use client";

import { useEffect, useState } from "react";
import type { NextPage } from "next";
import dynamic from "next/dynamic";

// Dynamically import components with SSR disabled to prevent hydration mismatches
const InvestTab = dynamic(() => import("~~/app/_components/InvestTab").then(mod => mod.InvestTab), { ssr: false });
const PlayTab = dynamic(() => import("~~/app/_components/PlayTab").then(mod => mod.PlayTab), { ssr: false });
const RulesTab = dynamic(() => import("~~/app/_components/RulesTab").then(mod => mod.RulesTab), { ssr: false });

type Tab = "play" | "invest" | "rules";

const Home: NextPage = () => {
  const [tab, setTab] = useState<Tab>("play");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex flex-col grow w-full items-center px-3 sm:px-5 py-6">
        <div className="w-full max-w-5xl flex justify-center py-16">
          <span className="loading loading-spinner loading-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col grow w-full items-center px-3 sm:px-5 py-6">
      <div className="w-full max-w-5xl">
        <div className="text-center mb-6">
          <h1 className="text-4xl font-bold flex items-center justify-center gap-2">
            <span>🦪</span> 25 Clams
          </h1>
          <p className="text-base-content/70 mt-1">Deal or No Deal on Base — CLAWD jackpots</p>
        </div>

        <div role="tablist" className="tabs tabs-boxed justify-center mb-6 bg-base-200">
          <button 
            role="tab" 
            className={`tab ${tab === "play" ? "tab-active" : ""}`} 
            onClick={() => setTab("play")}
          >
            Play
          </button>
          <button 
            role="tab" 
            className={`tab ${tab === "invest" ? "tab-active" : ""}`} 
            onClick={() => setTab("invest")}
          >
            Invest
          </button>
          <button 
            role="tab" 
            className={`tab ${tab === "rules" ? "tab-active" : ""}`} 
            onClick={() => setTab("rules")}
          >
            Rules
          </button>
        </div>

        <div className="min-h-[400px]">
          {tab === "play" && <PlayTab />}
          {tab === "invest" && <InvestTab />}
          {tab === "rules" && <RulesTab />}
        </div>
      </div>
    </div>
  );
};

export default Home;
