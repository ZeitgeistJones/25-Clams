"use client";

import { useMemo, useState } from "react";
import { Address } from "@scaffold-ui/components";
import { formatUnits, parseUnits } from "viem";
import { base } from "viem/chains";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { CLAWD_DECIMALS } from "~~/app/_constants/clams";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

const POOL_ADDRESS = "0x94a312581269433d52F83c8FFd34097370627E2a";

const fmt = (v?: bigint) =>
  v === undefined
    ? "—"
    : Number(formatUnits(v, CLAWD_DECIMALS)).toLocaleString(undefined, { maximumFractionDigits: 4 });

export const InvestTab = () => {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const onBase = chainId === base.id;

  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawShares, setWithdrawShares] = useState("");

  const [approvalSubmitting, setApprovalSubmitting] = useState(false);
  const [approvalCooldown, setApprovalCooldown] = useState(false);
  const [depositSubmitting, setDepositSubmitting] = useState(false);
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);

  const { data: totalPooled } = useScaffoldReadContract({ contractName: "ClamsPool", functionName: "totalPooled" });
  const { data: totalShares } = useScaffoldReadContract({ contractName: "ClamsPool", functionName: "totalShares" });
  const { data: gameActive } = useScaffoldReadContract({ contractName: "ClamsPool", functionName: "gameActive" });
  const { data: userShares } = useScaffoldReadContract({
    contractName: "ClamsPool",
    functionName: "shares",
    args: [address],
  });
  const { data: userCLAWD } = useScaffoldReadContract({
    contractName: "ClamsPool",
    functionName: "userSharesCLAWD",
    args: [address],
  });
  const { data: clawdBalance } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "balanceOf",
    args: [address],
  });
  const { data: allowance, refetch: refetchAllowance } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "allowance",
    args: [address, POOL_ADDRESS],
  });

  const { writeContractAsync: writeClawd } = useScaffoldWriteContract({ contractName: "CLAWD" });
  const { writeContractAsync: writePool } = useScaffoldWriteContract({ contractName: "ClamsPool" });

  const shareValue = useMemo(() => {
    const pooled = totalPooled !== undefined ? BigInt(totalPooled) : 0n;
    const shares = totalShares !== undefined ? BigInt(totalShares) : 0n;
    if (shares > 0n) {
      return (pooled * 10n ** 18n) / shares;
    }
    return undefined;
  }, [totalPooled, totalShares]);

  let depositParsed: bigint | undefined;
  try {
    depositParsed = depositAmount ? parseUnits(depositAmount, CLAWD_DECIMALS) : undefined;
  } catch {
    depositParsed = undefined;
  }

  const needsApproval = allowance === undefined || (depositParsed !== undefined && allowance < depositParsed);

  const handleApprove = async () => {
    if (approvalSubmitting || approvalCooldown || !depositParsed) return;
    setApprovalSubmitting(true);
    try {
      await writeClawd({ functionName: "approve", args: [POOL_ADDRESS, depositParsed] });
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

  const handleDeposit = async () => {
    if (depositSubmitting || !depositParsed) return;
    setDepositSubmitting(true);
    try {
      await writePool({ functionName: "deposit", args: [depositParsed] });
      notification.success("Deposit successful!");
      setDepositAmount("");
    } catch {
      notification.error("Deposit failed");
    } finally {
      setDepositSubmitting(false);
    }
  };

  const handleWithdraw = async () => {
    if (withdrawSubmitting || !withdrawShares) return;
    setWithdrawSubmitting(true);
    try {
      const sharesParsed = parseUnits(withdrawShares, 18);
      await writePool({ functionName: "withdraw", args: [sharesParsed] });
      notification.success("Withdrawal successful!");
      setWithdrawShares("");
    } catch {
      notification.error("Withdrawal failed");
    } finally {
      setWithdrawSubmitting(false);
    }
  };

  const walletGate = !isConnected ? (
    <RainbowKitCustomConnectButton />
  ) : !onBase ? (
    <button className="btn btn-primary" onClick={() => switchChain({ chainId: base.id })}>
      Switch to Base
    </button>
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Pool Stats */}
      <div className="card bg-base-200 shadow-md">
        <div className="card-body p-5">
          <h3 className="card-title text-sm uppercase text-base-content/60">Pool Stats</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-2">
            <div>
              <div className="text-xs text-base-content/50">Total Pooled</div>
              <div className="text-xl font-bold">{fmt(totalPooled)}</div>
            </div>
            <div>
              <div className="text-xs text-base-content/50">Total Shares</div>
              <div className="text-xl font-bold">{fmt(totalShares)}</div>
            </div>
            <div>
              <div className="text-xs text-base-content/50">Share Value</div>
              <div className="text-xl font-bold">{shareValue ? Number(formatUnits(shareValue, 18)).toFixed(4) : "—"}</div>
            </div>
            <div>
              <div className="text-xs text-base-content/50">Status</div>
              <div className={`text-xl font-bold ${gameActive ? "text-success" : "text-base-content/40"}`}>
                {gameActive ? "Active" : "Idle"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Your Investment */}
      <div className="card bg-base-200 shadow-md">
        <div className="card-body p-5">
          <h3 className="card-title text-sm uppercase text-base-content/60">Your Investment</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
            <div>
              <div className="text-xs text-base-content/50">Your Shares</div>
              <div className="text-xl font-bold">{fmt(userShares)}</div>
            </div>
            <div>
              <div className="text-xs text-base-content/50">Value in CLAWD</div>
              <div className="text-xl font-bold">{fmt(userCLAWD)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Deposit */}
        <div className="card bg-base-200 shadow-md">
          <div className="card-body p-5">
            <h3 className="card-title">Deposit</h3>
            <div className="form-control">
              <label className="label">
                <span className="label-text">Amount to Invest (CLAWD)</span>
                <span className="label-text-alt">Balance: {fmt(clawdBalance)}</span>
              </label>
              <div className="join">
                <input
                  type="number"
                  placeholder="0.0"
                  className="input input-bordered join-item w-full"
                  value={depositAmount}
                  onChange={e => setDepositAmount(e.target.value)}
                />
                <button className="btn btn-ghost join-item border-base-300" onClick={() => setDepositAmount(formatUnits(clawdBalance || 0n, CLAWD_DECIMALS))}>
                  MAX
                </button>
              </div>
            </div>
            <div className="mt-4">
              {walletGate ? (
                walletGate
              ) : needsApproval ? (
                <button
                  className="btn btn-secondary w-full"
                  onClick={handleApprove}
                  disabled={approvalSubmitting || approvalCooldown || !depositParsed}
                >
                  {approvalSubmitting || approvalCooldown ? <span className="loading loading-spinner loading-sm" /> : null}
                  Approve CLAWD
                </button>
              ) : (
                <button
                  className="btn btn-primary w-full"
                  onClick={handleDeposit}
                  disabled={depositSubmitting || !depositParsed || depositParsed === 0n}
                >
                  {depositSubmitting ? <span className="loading loading-spinner loading-sm" /> : null}
                  Deposit
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Withdraw */}
        <div className="card bg-base-200 shadow-md">
          <div className="card-body p-5">
            <h3 className="card-title">Withdraw</h3>
            <div className="form-control">
              <label className="label">
                <span className="label-text">Shares to Withdraw</span>
                <span className="label-text-alt">Available: {fmt(userShares)}</span>
              </label>
              <div className="join">
                <input
                  type="number"
                  placeholder="0.0"
                  className="input input-bordered join-item w-full"
                  value={withdrawShares}
                  onChange={e => setWithdrawShares(e.target.value)}
                />
                <button className="btn btn-ghost join-item border-base-300" onClick={() => setWithdrawShares(formatUnits(userShares || 0n, 18))}>
                  MAX
                </button>
              </div>
            </div>
            <div className="mt-4">
              {walletGate ? (
                walletGate
              ) : (
                <button
                  className="btn btn-primary w-full"
                  onClick={handleWithdraw}
                  disabled={withdrawSubmitting || !withdrawShares || gameActive}
                >
                  {withdrawSubmitting ? <span className="loading loading-spinner loading-sm" /> : null}
                  {gameActive ? "Locked during game" : "Withdraw"}
                </button>
              )}
              {gameActive && (
                <p className="text-[10px] text-error mt-2 text-center">
                  Withdrawals are disabled while a game is in progress to protect the pool.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
