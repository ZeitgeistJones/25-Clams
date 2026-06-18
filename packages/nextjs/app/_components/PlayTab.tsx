"use client";

import { useEffect, useMemo, useState } from "react";
import { Address } from "@scaffold-ui/components";
import { formatUnits } from "viem";
import { base } from "viem/chains";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { ClamAvatar } from "~~/app/_components/ClamAvatar";
import {
  CLAMS_PER_ROUND,
  CLAM_CHARACTERS,
  CLAWD_DECIMALS,
  ENTRY_FEE,
  FORFEIT_TIMEOUT_SECONDS,
  TOTAL_ROUNDS,
} from "~~/app/_constants/clams";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useScaffoldEventHistory, useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

const GAME_ADDRESS = "0x5E91944DB001C70435E2425DF14430829d4fBc06";

const fmt = (v?: bigint) =>
  v === undefined
    ? "—"
    : Number(formatUnits(v, CLAWD_DECIMALS)).toLocaleString(undefined, { maximumFractionDigits: 2 });

export const PlayTab = () => {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const onBase = chainId === base.id;

  // Local UI state
  const [chosenClam, setChosenClam] = useState<number | null>(null);
  const [selectedForElim, setSelectedForElim] = useState<Set<number>>(new Set());
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  // Submission guards
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);
  const [approvalCooldown, setApprovalCooldown] = useState(false);
  const [startSubmitting, setStartSubmitting] = useState(false);
  const [elimSubmitting, setElimSubmitting] = useState(false);
  const [dealSubmitting, setDealSubmitting] = useState(false);
  const [forfeitSubmitting, setForfeitSubmitting] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const { data: rawGame } = useScaffoldReadContract({ contractName: "ClamsGame", functionName: "currentGame" });
  const { data: totalPooled } = useScaffoldReadContract({ contractName: "ClamsPool", functionName: "totalPooled" });
  const { data: jackpotPreview } = useScaffoldReadContract({
    contractName: "ClamsGame",
    functionName: "getJackpotValue",
    args: [totalPooled ?? 0n],
  });

  // Safely map rawGame to a typed object using named properties
  const game = useMemo(() => {
    if (!rawGame) return null;
    // rawGame is returned as an object with named properties by viem/wagmi
    const g = rawGame as any;
    return {
      contestant: g.contestant,
      jackpotValue: g.jackpotValue,
      contestantClam: Number(g.contestantClam),
      currentRound: Number(g.currentRound),
      lastActionTimestamp: g.lastActionTimestamp,
      currentOffer: g.currentOffer,
      active: g.active,
      vrfPending: g.vrfPending,
      roundEliminated: g.roundEliminated,
      vrfRequestId: g.vrfRequestId,
    };
  }, [rawGame]);

  const { data: eliminatedEvents } = useScaffoldEventHistory({
    contractName: "ClamsGame",
    eventName: "ClamsEliminated",
    fromBlock: 47124293n,
    watch: true,
  });

  const eliminatedIds = useMemo(() => {
    const set = new Set<number>();
    eliminatedEvents?.forEach(e => {
      e.args.clamIds?.forEach((id: any) => set.add(Number(id)));
    });
    return set;
  }, [eliminatedEvents]);

  const { writeContractAsync: writeClamsGame } = useScaffoldWriteContract({ contractName: "ClamsGame" });
  const { writeContractAsync: writeClawd } = useScaffoldWriteContract({ contractName: "CLAWD" });
  const { data: allowance } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "allowance",
    args: [address, GAME_ADDRESS],
  });

  const needsApproval = isConnected && (allowance ?? 0n) < ENTRY_FEE;
  const isMyGame = game?.active && game?.contestant === address;
  const isMyPending = game?.vrfPending && game?.contestant === address;

  const secondsLeft = useMemo(() => {
    if (!game?.lastActionTimestamp) return 0;
    const deadline = game.lastActionTimestamp + BigInt(FORFEIT_TIMEOUT_SECONDS);
    const diff = deadline - BigInt(now);
    return diff > 0n ? Number(diff) : 0;
  }, [game?.lastActionTimestamp, now]);

  const handleApprove = async () => {
    setApprovalSubmitting(true);
    try {
      await writeClawd({ functionName: "approve", args: [GAME_ADDRESS, ENTRY_FEE * 100n] });
      setApprovalCooldown(true);
      setTimeout(() => setApprovalCooldown(false), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setApprovalSubmitting(false);
    }
  };

  const handleStart = async () => {
    if (chosenClam === null) return;
    setStartSubmitting(true);
    try {
      await writeClamsGame({ functionName: "startGame", args: [chosenClam] });
    } catch (e) {
      console.error(e);
    } finally {
      setStartSubmitting(false);
    }
  };

  const handleEliminate = async () => {
    if (selectedForElim.size === 0) return;
    setElimSubmitting(true);
    try {
      await writeClamsGame({ functionName: "eliminateClams", args: [Array.from(selectedForElim)] });
      setSelectedForElim(new Set());
    } catch (e) {
      console.error(e);
    } finally {
      setElimSubmitting(false);
    }
  };

  const handleDeal = async () => {
    setDealSubmitting(true);
    try {
      await writeClamsGame({ functionName: "deal" });
    } catch (e) {
      console.error(e);
    } finally {
      setDealSubmitting(false);
    }
  };

  const handleNoDeal = async () => {
    setDealSubmitting(true);
    try {
      await writeClamsGame({ functionName: "noDeal" });
    } catch (e) {
      console.error(e);
    } finally {
      setDealSubmitting(false);
    }
  };

  const handleFinalReveal = async () => {
    setDealSubmitting(true);
    try {
      await writeClamsGame({ functionName: "finalReveal" });
    } catch (e) {
      console.error(e);
    } finally {
      setDealSubmitting(false);
    }
  };

  const handleForfeit = async () => {
    setForfeitSubmitting(true);
    try {
      await writeClamsGame({ functionName: "forfeit" });
    } catch (e) {
      console.error(e);
    } finally {
      setForfeitSubmitting(false);
    }
  };

  const toggleElim = (id: number) => {
    if (eliminatedIds.has(id) || id === game?.contestantClam) return;
    const next = new Set(selectedForElim);
    if (next.has(id)) next.delete(id);
    else {
      const round = game?.currentRound ?? 0;
      const limit = CLAMS_PER_ROUND[round] || 0;
      if (next.size < limit) next.add(id);
    }
    setSelectedForElim(next);
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      {/* Header Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-base-200 p-4 rounded-xl shadow-sm">
          <div className="text-xs uppercase text-base-content/60">Jackpot</div>
          <div className="text-xl font-bold text-primary">{fmt(game?.active ? game.jackpotValue : jackpotPreview)} CLAWD</div>
        </div>
        <div className="bg-base-200 p-4 rounded-xl shadow-sm">
          <div className="text-xs uppercase text-base-content/60">Entry Fee</div>
          <div className="text-xl font-bold">{fmt(ENTRY_FEE)} CLAWD</div>
        </div>
        <div className="bg-base-200 p-4 rounded-xl shadow-sm">
          <div className="text-xs uppercase text-base-content/60">Status</div>
          <div className="text-sm font-medium">
            {game?.vrfPending ? "VRF Pending..." : game?.active ? `Round ${game.currentRound + 1}` : "Waiting to Start"}
          </div>
        </div>
        <div className="bg-base-200 p-4 rounded-xl shadow-sm">
          <div className="text-xs uppercase text-base-content/60">Time Left</div>
          <div className="text-xl font-mono font-bold">
            {game?.active ? `${Math.floor(secondsLeft / 3600)}h ${Math.floor((secondsLeft % 3600) / 60)}m` : "—"}
          </div>
        </div>
      </div>

      {/* Main Game Area */}
      <div className="card bg-base-100 shadow-xl border border-base-300">
        <div className="card-body p-4 sm:p-8">
          {!isConnected ? (
            <div className="text-center py-12">
              <h2 className="text-2xl font-bold mb-4">Ready to play?</h2>
              <p className="mb-6 text-base-content/70">Connect your wallet to start a new game of 25 Clams.</p>
              <RainbowKitCustomConnectButton />
            </div>
          ) : !onBase ? (
            <div className="text-center py-12">
              <h2 className="text-2xl font-bold mb-4">Wrong Network</h2>
              <p className="mb-6 text-base-content/70">Please switch to Base Mainnet to play.</p>
              <button className="btn btn-primary" onClick={() => switchChain({ chainId: base.id })}>
                Switch to Base
              </button>
            </div>
          ) : isMyPending ? (
            <div className="text-center py-12">
              <span className="loading loading-ring loading-lg text-primary mb-4"></span>
              <h2 className="text-2xl font-bold">Waiting for VRF...</h2>
              <p className="text-base-content/70">Chainlink is shuffling the clams. This usually takes 1-2 minutes.</p>
            </div>
          ) : isMyGame ? (
            <div className="flex flex-col gap-8">
              {/* Game UI */}
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-base-200 p-4 rounded-xl">
                <div>
                  <h3 className="font-bold text-lg">Your Clam: #{game.contestantClam}</h3>
                  <p className="text-sm text-base-content/70">Don't eliminate this one!</p>
                </div>
                <div className="flex gap-2">
                  {game.roundEliminated ? (
                    <>
                      <button className="btn btn-success" onClick={handleDeal} disabled={dealSubmitting}>
                        Deal ({fmt(game.currentOffer)} CLAWD)
                      </button>
                      <button className="btn btn-outline" onClick={handleNoDeal} disabled={dealSubmitting}>
                        No Deal
                      </button>
                    </>
                  ) : game.currentRound === TOTAL_ROUNDS ? (
                    <button className="btn btn-primary" onClick={handleFinalReveal} disabled={dealSubmitting}>
                      Final Reveal
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary"
                      onClick={handleEliminate}
                      disabled={elimSubmitting || selectedForElim.size !== CLAMS_PER_ROUND[game.currentRound]}
                    >
                      Eliminate {selectedForElim.size}/{CLAMS_PER_ROUND[game.currentRound]}
                    </button>
                  )}
                </div>
              </div>

              <ClamGrid
                eliminatedIds={eliminatedIds}
                selectedForElim={selectedForElim}
                onToggle={toggleElim}
                myClamId={game.contestantClam}
              />
            </div>
          ) : game?.active ? (
            <div className="text-center py-12">
              <h2 className="text-2xl font-bold mb-2">Game in Progress</h2>
              <p className="text-base-content/70 mb-6">
                Contestant: <Address address={game.contestant} />
              </p>
              {secondsLeft === 0 && (
                <button className="btn btn-warning" onClick={handleForfeit} disabled={forfeitSubmitting}>
                  Forfeit Stalled Game
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-8 py-4">
              <h2 className="text-2xl font-bold">Pick Your Clam</h2>
              <div className="grid grid-cols-5 gap-4">
                {Array.from({ length: 25 }).map((_, i) => (
                  <button
                    key={i}
                    className={`w-12 h-12 sm:w-16 sm:h-16 rounded-xl flex items-center justify-center transition-all ${
                      chosenClam === i ? "bg-primary text-primary-content scale-110 shadow-lg" : "bg-base-200 hover:bg-base-300"
                    }`}
                    onClick={() => setChosenClam(i)}
                  >
                    <span className="font-bold text-lg">#{i}</span>
                  </button>
                ))}
              </div>
              {needsApproval ? (
                <button className="btn btn-secondary btn-wide" onClick={handleApprove} disabled={approvalSubmitting || approvalCooldown}>
                  {approvalSubmitting ? <span className="loading loading-spinner"></span> : "Approve CLAWD"}
                </button>
              ) : (
                <button className="btn btn-primary btn-wide" onClick={handleStart} disabled={startSubmitting || chosenClam === null}>
                  {startSubmitting ? <span className="loading loading-spinner"></span> : "Start Game (1,000 CLAWD)"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer Links */}
      <div className="flex justify-center gap-4 text-sm text-base-content/50">
        <a href={`https://basescan.org/address/${GAME_ADDRESS}`} target="_blank" rel="noreferrer" className="hover:underline">
          ClamsGame Contract
        </a>
        <span>•</span>
        <a href="https://basescan.org/address/0x94a312581269433d52F83c8FFd34097370627E2a" target="_blank" rel="noreferrer" className="hover:underline">
          ClamsPool Contract
        </a>
      </div>
    </div>
  );
};

const ClamGrid = ({
  eliminatedIds,
  selectedForElim,
  onToggle,
  myClamId,
}: {
  eliminatedIds: Set<number>;
  selectedForElim: Set<number>;
  onToggle: (id: number) => void;
  myClamId: number;
}) => {
  return (
    <div className="grid grid-cols-5 gap-3 sm:gap-4">
      {Array.from({ length: 25 }).map((_, i) => {
        const isEliminated = eliminatedIds.has(i);
        const isSelected = selectedForElim.has(i);
        const isMine = i === myClamId;

        return (
          <button
            key={i}
            disabled={isEliminated || isMine}
            onClick={() => onToggle(i)}
            className={`relative aspect-square rounded-xl flex flex-col items-center justify-center transition-all border-2 ${
              isEliminated
                ? "bg-base-300 border-transparent opacity-40 grayscale"
                : isMine
                ? "bg-primary/10 border-primary shadow-inner"
                : isSelected
                ? "bg-secondary/20 border-secondary scale-105 shadow-md"
                : "bg-base-200 border-transparent hover:border-base-content/20"
            }`}
          >
            <ClamAvatar char={CLAM_CHARACTERS[i % CLAM_CHARACTERS.length]} size={40} />
            <span className={`text-xs font-bold mt-1 ${isMine ? "text-primary" : ""}`}>
              {isMine ? "MINE" : isEliminated ? "X" : `#${i}`}
            </span>
          </button>
        );
      })}
    </div>
  );
};
