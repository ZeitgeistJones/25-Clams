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
    args: [totalPooled ?? 0n],
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
    const g = rawGame as any;
    
    // Handle both array and object formats from viem/wagmi
    const getVal = (key: string, index: number) => {
      if (g[key] !== undefined) return g[key];
      if (Array.isArray(g) && g[index] !== undefined) return g[index];
      return undefined;
    };

    try {
      return {
        contestant: String(getVal(\"contestant\", 0) || \"\"),
        jackpotValue: BigInt(getVal(\"jackpotValue\", 1) || 0n),
        contestantClam: Number(getVal(\"contestantClam\", 2) || 0),
        currentRound: Number(getVal(\"currentRound\", 3) || 0),
        lastActionTimestamp: BigInt(getVal(\"lastActionTimestamp\", 4) || 0n),
        currentOffer: BigInt(getVal(\"currentOffer\", 5) || 0n),
        active: Boolean(getVal(\"active\", 6)),
        vrfPending: Boolean(getVal(\"vrfPending\", 7)),
        roundEliminated: Boolean(getVal(\"roundEliminated\", 8)),
        vrfRequestId: BigInt(getVal(\"vrfRequestId\", 9) || 0n),
      } as CurrentGame;
    } catch (e) {
      console.error(\"Error parsing game data:\", e);
      return undefined;
    }
  }, [rawGame]);

  const { data: elimEvents } = useScaffoldEventHistory({
    contractName: "ClamsGame",
    eventName: "ClamsEliminated",
    fromBlock: 47124293n,
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

  const needsApproval = allowance === undefined || allowance < ENTRY_FEE;
  const isContestant = !!game && !!address && game.contestant.toLowerCase() === address.toLowerCase();

  const elimNeeded =
    game && game.currentRound < CLAMS_PER_ROUND.length ? (CLAMS_PER_ROUND[game.currentRound] as number) : 0;

  const forfeitDeadline =
    game && game.lastActionTimestamp > 0n ? game.lastActionTimestamp + FORFEIT_TIMEOUT_SECONDS : 0n;
  const timedOut = game?.active && forfeitDeadline > 0n ? BigInt(now) >= forfeitDeadline : false;
  const secondsLeft =
    game?.active && forfeitDeadline > 0n ? (forfeitDeadline > BigInt(now) ? Number(forfeitDeadline - BigInt(now)) : 0) : 0;

  // ---- Handlers ----
  const handleApprove = async () => {
    if (approvalSubmitting || approvalCooldown) return;
    setApprovalSubmitting(true);
    try {
      await writeClawd({ functionName: "approve", args: [GAME_ADDRESS, ENTRY_FEE] });
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
      await writeGame({ functionName: "startGame", args: [chosenClam] });
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
      const ids = Array.from(selectedForElim).sort((a, b) => a - b);
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
    !!game?.active && isContestant && !!game.roundEliminated && (game.currentOffer || 0n) > 0n && !isFinalRound;

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
                    {game.currentOffer > 0n ? `${fmt(game.currentOffer)} CLAWD` : "—"}
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

              {/* Contestant actions */}
              {isContestant && (
                <div className="mt-3 flex flex-col gap-3">
                  {walletGate ? (
                    walletGate
                  ) : isFinalRound ? (
                    <button className="btn btn-primary" onClick={handleFinalReveal} disabled={dealSubmitting}>
                      {dealSubmitting ? <span className="loading loading-spinner loading-sm" /> : null}
                      Final Reveal
                    </button>
                  ) : !game.roundEliminated ? (
                    <button
                      className="btn btn-primary"
                      onClick={handleEliminate}
                      disabled={elimSubmitting || selectedForElim.size !== elimNeeded || elimNeeded === 0}
                    >
                      {elimSubmitting ? <span className="loading loading-spinner loading-sm" /> : null}
                      Confirm Eliminations
                    </button>
                  ) : null}
                </div>
              )}

              {/* Forfeit available to anyone after timeout */}
              {timedOut && !walletGate && (
                <button className="btn btn-error btn-outline mt-2" onClick={handleForfeit} disabled={forfeitSubmitting}>
                  {forfeitSubmitting ? <span className="loading loading-spinner loading-sm" /> : null}
                  Forfeit (timed out)
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Banker offer modal */}
      {showBankerOffer && (
        <div className="modal modal-open">
          <div className="modal-box bg-base-200">
            <h3 className="font-bold text-lg">🏦 The banker offers</h3>
            <p className="py-4 text-3xl font-bold text-center">{fmt(game.currentOffer)} CLAWD</p>
            <div className="modal-action justify-center gap-3">
              <button className="btn btn-success" onClick={() => handleDeal(true)} disabled={dealSubmitting}>
                {dealSubmitting ? <span className="loading loading-spinner loading-sm" /> : null}
                Deal
              </button>
              <button className="btn btn-outline" onClick={() => handleDeal(false)} disabled={dealSubmitting}>
                No Deal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ---- Grid ----
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
}) => {
  return (
    <div className="grid grid-cols-5 gap-2 sm:gap-3">
      {CLAM_CHARACTERS.map((char, id) => {
        const eliminated = eliminatedValues.has(id);
        const isHeld = heldClam === id;
        const isSelected = selected.has(id);
        const clickable =
          selectionMode && !eliminated && !(isHeld && selectionMode && heldClam !== null && !isSelected);

        return (
          <button
            key={id}
            type="button"
            onClick={() => onClamClick(id)}
            disabled={!selectionMode || eliminated}
            className={[
              "relative flex flex-col items-center rounded-xl p-2 transition bg-base-100 border-2",
              eliminated ? "opacity-40 border-base-300 grayscale" : "border-base-300",
              isHeld ? "ring-2 ring-primary border-primary" : "",
              isSelected ? "border-warning ring-2 ring-warning" : "",
              clickable && !eliminated ? "hover:border-primary cursor-pointer" : "cursor-default",
            ].join(" ")}
          >
            <ClamAvatar char={char} size={48} />
            <span className="text-[10px] font-semibold mt-1 truncate w-full text-center">{char.name}</span>
            <span className="text-[9px] text-base-content/50">#{id}</span>
            {eliminated && <span className="text-[10px] font-bold text-error">{fmt(eliminatedValues.get(id))}</span>}
            {isHeld && (
              <span className="absolute top-0 right-0 text-[9px] bg-primary text-primary-content px-1 rounded-bl">
                YOURS
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
