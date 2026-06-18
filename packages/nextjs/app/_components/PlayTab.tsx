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

type CurrentGame = {
  contestant: string;
  jackpotValue: bigint;
  contestantClam: number;
  currentRound: number;
  lastActionTimestamp: bigint;
  currentOffer: bigint;
  active: boolean;
  vrfPending: boolean;
  roundEliminated: boolean;
  vrfRequestId: bigint;
};

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
    args: [totalPooled ?? BigInt(0)],
  });
  const { data: clawdBalance } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "balanceOf",
    args: [address],
  });
  const { data: allowance, refetch: refetchAllowance } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "allowance",
    args: [address, GAME_ADDRESS],
  });

  const game = useMemo(() => {
    if (!rawGame) return undefined;
    try {
      const g = rawGame as any;
      const isArray = Array.isArray(g);
      return {
        contestant: String((isArray ? g[0] : g.contestant) || ""),
        jackpotValue: BigInt((isArray ? g[1] : g.jackpotValue) || BigInt(0)),
        contestantClam: Number((isArray ? g[2] : g.contestantClam) || 0),
        currentRound: Number((isArray ? g[3] : g.currentRound) || 0),
        lastActionTimestamp: BigInt((isArray ? g[4] : g.lastActionTimestamp) || BigInt(0)),
        currentOffer: BigInt((isArray ? g[5] : g.currentOffer) || BigInt(0)),
        active: Boolean(isArray ? g[6] : g.active),
        vrfPending: Boolean(isArray ? g[7] : g.vrfPending),
        roundEliminated: Boolean(isArray ? g[8] : g.roundEliminated),
        vrfRequestId: BigInt((isArray ? g[9] : g.vrfRequestId) || BigInt(0)),
      } as CurrentGame;
    } catch (e) {
      console.error("Error parsing game data:", e);
      return undefined;
    }
  }, [rawGame]);

  const { data: elimEvents } = useScaffoldEventHistory({
    contractName: "ClamsGame",
    eventName: "ClamsEliminated",
    fromBlock: BigInt(47124293),
    watch: true,
    blockData: false,
  });

  // Map eliminated clamId -> revealed value, gathered from event history.
  const eliminatedValues = useMemo(() => {
    const map = new Map<number, bigint>();
    if (!elimEvents) return map;
    for (const ev of elimEvents) {
      const args = (ev as { args?: { clamIds?: readonly number[]; values?: readonly bigint[] } }).args;
      const ids = args?.clamIds;
      const vals = args?.values;
      if (!ids || !vals) continue;
      ids.forEach((id, i) => {
        map.set(Number(id), vals[i]);
      });
    }
    return map;
  }, [elimEvents]);

  const { writeContractAsync: writeClawd } = useScaffoldWriteContract({ contractName: "CLAWD" });
  const { writeContractAsync: writeGame } = useScaffoldWriteContract({ contractName: "ClamsGame" });

  const needsApproval = isConnected && (allowance === undefined || allowance < ENTRY_FEE);
  const isContestant = !!game && !!address && game.contestant.toLowerCase() === address.toLowerCase();

  const elimNeeded =
    game && game.currentRound < CLAMS_PER_ROUND.length ? (CLAMS_PER_ROUND[game.currentRound] as number) : 0;

  const forfeitDeadline =
    game && game.lastActionTimestamp > BigInt(0) ? game.lastActionTimestamp + BigInt(FORFEIT_TIMEOUT_SECONDS) : BigInt(0);
  const timedOut = game?.active && forfeitDeadline > BigInt(0) ? BigInt(now) >= forfeitDeadline : false;
  const secondsLeft =
    game?.active && forfeitDeadline > BigInt(0) ? (forfeitDeadline > BigInt(now) ? Number(forfeitDeadline - BigInt(now)) : 0) : 0;

  // ---- Handlers ----
  const handleApprove = async () => {
    if (approvalSubmitting || approvalCooldown) return;
    setApprovalSubmitting(true);
    try {
      await writeClawd({ functionName: "approve", args: [GAME_ADDRESS, ENTRY_FEE * BigInt(100)] });
      setApprovalCooldown(true);
      setTimeout(() => {
        setApprovalCooldown(false);
        refetchAllowance();
      }, 4000);
    } catch {
      notification.error("Approval failed");
    } finally {
      setApprovalSubmitting(false);
    }
  };

  const handleStart = async () => {
    if (startSubmitting || chosenClam === null) return;
    setStartSubmitting(true);
    try {
      await writeGame({ functionName: "startGame", args: [BigInt(chosenClam)] });
      notification.success("Game starting — shuffling clams!");
    } catch {
      notification.error("Failed to start game");
    } finally {
      setStartSubmitting(false);
    }
  };

  const handleEliminate = async () => {
    if (elimSubmitting || selectedForElim.size !== elimNeeded) return;
    setElimSubmitting(true);
    try {
      const ids = Array.from(selectedForElim).sort((a, b) => a - b).map(id => BigInt(id));
      await writeGame({ functionName: "eliminateClams", args: [ids] });
      notification.success("Clams eliminated!");
      setSelectedForElim(new Set());
    } catch {
      notification.error("Elimination failed");
    } finally {
      setElimSubmitting(false);
    }
  };

  const handleDeal = async (take: boolean) => {
    if (dealSubmitting) return;
    setDealSubmitting(true);
    try {
      await writeGame({ functionName: take ? "deal" : "noDeal" });
      notification.success(take ? "Deal taken!" : "No deal — keep playing!");
    } catch {
      notification.error("Action failed");
    } finally {
      setDealSubmitting(false);
    }
  };

  const handleFinalReveal = async () => {
    if (dealSubmitting) return;
    setDealSubmitting(true);
    try {
      await writeGame({ functionName: "finalReveal" });
      notification.success("Final reveal!");
    } catch {
      notification.error("Final reveal failed");
    } finally {
      setDealSubmitting(false);
    }
  };

  const handleForfeit = async () => {
    if (forfeitSubmitting) return;
    setForfeitSubmitting(true);
    try {
      await writeGame({ functionName: "forfeit" });
      notification.success("Game forfeited");
    } catch {
      notification.error("Forfeit failed");
    } finally {
      setForfeitSubmitting(false);
    }
  };

  const toggleElim = (id: number) => {
    if (!isContestant || !game?.active) return;
    if (id === game.contestantClam) return; // can't eliminate your own clam
    if (eliminatedValues.has(id)) return;
    setSelectedForElim(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < elimNeeded) next.add(id);
      return next;
    });
  };

  const noActiveGame = game && !game.active && !game.vrfPending;
  const isFinalRound = game ? game.currentRound >= TOTAL_ROUNDS - 1 : false;
  const showBankerOffer =
    !!game?.active && isContestant && !!game.roundEliminated && (game.currentOffer || BigInt(0)) > BigInt(0) && !isFinalRound;

  // ---- Wallet gate (single button) ----
  const walletGate = !isConnected ? (
    <RainbowKitCustomConnectButton />
  ) : !onBase ? (
    <button className="btn btn-primary" onClick={() => switchChain({ chainId: base.id })}>
      Switch to Base
    </button>
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Jackpot / fee summary */}
      <div className="card bg-base-200 shadow-md">
        <div className="card-body p-5 flex-row flex-wrap justify-between items-center gap-4">
          <div>
            <div className="text-xs uppercase text-base-content/60">Jackpot</div>
            <div className="text-2xl font-bold">{fmt(game?.active ? game.jackpotValue : jackpotPreview)} CLAWD</div>
          </div>
          <div>
            <div className="text-xs uppercase text-base-content/60">Entry Fee</div>
            <div className="text-2xl font-bold">1,000 CLAWD</div>
          </div>
          {isConnected && (
            <div>
              <div className="text-xs uppercase text-base-content/60">Your CLAWD</div>
              <div className="text-2xl font-bold">{fmt(clawdBalance)}</div>
            </div>
          )}
        </div>
      </div>

      {/* VRF pending */}
      {game?.vrfPending && (
        <div className="card bg-base-200 shadow-md">
          <div className="card-body items-center text-center p-8">
            <span className="loading loading-spinner loading-lg" />
            <h3 className="text-xl font-bold mt-3">Shuffling clams... 🎲</h3>
            <p className="text-base-content/70">Waiting for Chainlink VRF to seed the board.</p>
          </div>
        </div>
      )}

      {/* No active game: start flow */}
      {noActiveGame && (
        <div className="card bg-base-200 shadow-md">
          <div className="card-body p-5">
            <h3 className="card-title">Start a new game</h3>
            <p className="text-base-content/70 text-sm">
              Pick the clam you want to hold for the whole game, then approve and start.
            </p>

            <ClamGrid
              eliminatedValues={eliminatedValues}
              heldClam={chosenClam !== null ? Number(chosenClam) : null}
              selectionMode
              selected={chosenClam !== null ? new Set([chosenClam]) : new Set()}
              onClamClick={id => setChosenClam(id)}
            />

            <div className="mt-2">
              {chosenClam !== null ? (
                <p className="text-sm">
                  Holding: <span className="font-semibold">{CLAM_CHARACTERS[chosenClam].name}</span> (#{chosenClam})
                </p>
              ) : (
                <p className="text-sm text-base-content/60">No clam selected yet.</p>
              )}
            </div>

            <div className="mt-2">
              {walletGate ? (
                walletGate
              ) : needsApproval ? (
                <button
                  className="btn btn-secondary"
                  onClick={handleApprove}
                  disabled={approvalSubmitting || approvalCooldown}
                >
                  {approvalSubmitting || approvalCooldown ? (
                    <span className="loading loading-spinner loading-sm" />
                  ) : null}
                  Approve 1,000 CLAWD
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={handleStart}
                  disabled={startSubmitting || chosenClam === null}
                >
                  {startSubmitting ? <span className="loading loading-spinner loading-sm" /> : null}
                  Start Game
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Active game */}
      {game?.active && (
        <>
          <div className="card bg-base-200 shadow-md">
            <div className="card-body p-5">
              <div className="flex flex-wrap justify-between gap-4">
                <div>
                  <div className="text-xs uppercase text-base-content/60">Round</div>
                  <div className="text-lg font-semibold">
                    {Math.min(game.currentRound + 1, TOTAL_ROUNDS)} of {TOTAL_ROUNDS}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase text-base-content/60">Contestant</div>
                  <Address address={game.contestant} />
                </div>
                <div>
                  <div className="text-xs uppercase text-base-content/60">Banker Offer</div>
                  <div className="text-lg font-semibold">
                    {game.currentOffer > BigInt(0) ? `${fmt(game.currentOffer)} CLAWD` : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase text-base-content/60">Forfeit In</div>
                  <div className="text-lg font-semibold">
                    {timedOut
                      ? "Timed out"
                      : `${Math.max(0, Math.floor(secondsLeft / 3600))}h ${Math.max(0, Math.floor((secondsLeft % 3600) / 60))}m`}
                  </div>
                </div>
              </div>

              {!isContestant && (
                <div className="alert alert-info mt-2">
                  <span>👀 Spectator view — you are not the contestant.</span>
                </div>
              )}
            </div>
          </div>

          {/* The board */}
          <div className="card bg-base-200 shadow-md">
            <div className="card-body p-5">
              <h3 className="card-title">The Board</h3>
              {isContestant && !game.roundEliminated && !isFinalRound && (
                <p className="text-sm">
                  Select clams to open this round — Selected: {selectedForElim.size}/{elimNeeded}
                </p>
              )}

              <ClamGrid
                eliminatedValues={eliminatedValues}
                heldClam={game.contestantClam}
                selectionMode={isContestant && !game.roundEliminated && !isFinalRound}
                selected={selectedForElim}
                onClamClick={toggleElim}
              />

              {isContestant && !game.roundEliminated && !isFinalRound && (
                <div className="mt-2">
                  <button
                    className="btn btn-primary"
                    onClick={handleEliminate}
                    disabled={elimSubmitting || selectedForElim.size !== elimNeeded}
                  >
                    {elimSubmitting ? <span className="loading loading-spinner loading-sm" /> : null}
                    Eliminate {elimNeeded} Clam{elimNeeded === 1 ? "" : "s"}
                  </button>
                </div>
              )}

              {isContestant && game.roundEliminated && showBankerOffer && (
                <div className="mt-2 flex flex-col gap-2">
                  <p className="text-sm text-base-content/70">
                    The Banker offers you {fmt(game.currentOffer)} CLAWD for your clam.
                  </p>
                  <div className="flex gap-2">
                    <button className="btn btn-primary" onClick={() => handleDeal(true)} disabled={dealSubmitting}>
                      {dealSubmitting ? <span className="loading loading-spinner loading-sm" /> : null}
                      Take the Deal
                    </button>
                    <button className="btn btn-secondary" onClick={() => handleDeal(false)} disabled={dealSubmitting}>
                      {dealSubmitting ? <span className="loading loading-spinner loading-sm" /> : null}
                      No Deal
                    </button>
                  </div>
                </div>
              )}

              {isContestant && game.roundEliminated && isFinalRound && (
                <div className="mt-2">
                  <button className="btn btn-primary" onClick={handleFinalReveal} disabled={dealSubmitting}>
                    {dealSubmitting ? <span className="loading loading-spinner loading-sm" /> : null}
                    Final Reveal
                  </button>
                </div>
              )}

              {isContestant && timedOut && (
                <div className="mt-2">
                  <button className="btn btn-warning" onClick={handleForfeit} disabled={forfeitSubmitting}>
                    {forfeitSubmitting ? <span className="loading loading-spinner loading-sm" /> : null}
                    Forfeit Game
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const ClamGrid = ({
  eliminatedValues,
  heldClam,
  selectionMode,
  selected,
  onClamClick,
}: {
  eliminatedValues: Map<number, bigint>;
  heldClam: number | null;
  selectionMode: boolean;
  selected: Set<number>;
  onClamClick: (id: number) => void;
}) => (
  <div className="grid grid-cols-5 gap-2 mt-4">
    {CLAM_CHARACTERS.map((clam, i) => {
      const isHeld = heldClam === i;
      const isEliminated = eliminatedValues.has(i);
      const isSelected = selected.has(i);

      return (
        <div
          key={i}
          className={`relative flex flex-col items-center justify-center p-2 border rounded-lg cursor-pointer
            ${isHeld ? "border-primary" : "border-base-300"}
            ${isEliminated ? "bg-base-300 opacity-50 cursor-not-allowed" : ""}
            ${isSelected ? "bg-secondary/30" : ""}
            ${selectionMode && !isHeld && !isEliminated ? "hover:bg-base-300" : ""}
            ${selectionMode && (isHeld || isEliminated) ? "cursor-not-allowed" : ""}
          `}
          onClick={() => selectionMode && !isHeld && !isEliminated && onClamClick(i)}
        >
          {isHeld && (
            <span className="absolute top-1 right-1 badge badge-primary badge-xs">Your Clam</span>
          )}
          {isEliminated && (
            <span className="absolute top-1 right-1 badge badge-error badge-xs">Eliminated</span>
          )}
          {isSelected && (
            <span className="absolute top-1 left-1 badge badge-secondary badge-xs">Selected</span>
          )}
          <ClamAvatar id={i} />
          <span className="text-xs mt-1">#{i}</span>
          {isEliminated && (
            <span className="text-sm font-semibold mt-1">{fmt(eliminatedValues.get(i))} CLAWD</span>
          )}
        </div>
      );
    })}
  </div>
);
