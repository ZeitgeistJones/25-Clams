"use client";

import { useState } from "react";
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

  const shareValue =
    (totalShares || 0n) > 0n && totalPooled !== undefined ? (totalPooled * 10n ** 18n) / totalShares! : undefined;

  let depositParsed: bigint | undefined;
  try {
    depositParsed = depositAmount ? parseUnits(depositAmount, CLAWD_DECIMALS) : undefined;
  } catch {
    depositParsed = undefined;
  }

  let withdrawParsed: bigint | undefined;
  try {
    withdrawParsed = withdrawShares ? parseUnits(withdrawShares, 18) : undefined;
  } catch {
    withdrawParsed = undefined;
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
    if (withdrawSubmitting || !withdrawParsed) return;
    setWithdrawSubmitting(true);
    try {
      await writePool({ functionName: "withdraw", args: [withdrawParsed] });
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
          <h3 className="card-title text-sm uppercase text-base-content/60">Pool Statistics</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-2">
            <div>
              <div className="text-xs text-base-content/60">Total Pooled</div>
              <div className="text-lg font-bold">{fmt(totalPooled)} CLAWD</div>
            </div>
            <div>
              <div className="text-xs text-base-content/60">Total Shares</div>
              <div className="text-lg font-bold">{totalShares ? formatUnits(totalShares, 18) : "—"}</div>
            </div>
            <div>
              <div className="text-xs text-base-content/60">Share Price</div>
              <div className="text-lg font-bold">{shareValue ? formatUnits(shareValue, 18) : "—"}</div>
            </div>
            <div>
              <div className="text-xs text-base-content/60">Status</div>
              <div className="text-lg font-bold">{gameActive ? "🎮 Game Active" : "💤 Idle"}</div>
            </div>
          </div>
        </div>
      </div>

      {/* User Stats */}
      {isConnected && (
        <div className="card bg-base-200 shadow-md border-l-4 border-primary">
          <div className="card-body p-5">
            <h3 className="card-title text-sm uppercase text-base-content/60">Your Investment</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-2">
              <div>
                <div className="text-xs text-base-content/60">Your Shares</div>
                <div className="text-lg font-bold">{userShares ? formatUnits(userShares, 18) : "—"}</div>
              </div>
              <div>
                <div className="text-xs text-base-content/60">Value in CLAWD</div>
                <div className="text-lg font-bold">{fmt(userCLAWD)}</div>
              </div>
              <div>
                <div className="text-xs text-base-content/60">Wallet Balance</div>
                <div className="text-lg font-bold">{fmt(clawdBalance)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Deposit */}
        <div className="card bg-base-200 shadow-md">
          <div className="card-body p-5">
            <h3 className="card-title">Deposit</h3>
            <p className="text-xs text-base-content/60">Invest CLAWD to earn a share of game entry fees.</p>
            <div className="form-control mt-2">
              <div className="join">
                <input
                  type="number"
                  placeholder="Amount"
                  className="input input-bordered join-item w-full"
                  value={depositAmount}
                  onChange={e => setDepositAmount(e.target.value)}
                />
                <button
                  className="btn btn-ghost join-item border-base-300"
                  onClick={() => setDepositAmount(formatUnits(clawdBalance || 0n, CLAWD_DECIMALS))}
                >
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
                  {approvalSubmitting || approvalCooldown ? (
                    <span className="loading loading-spinner loading-sm" />
                  ) : null}
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
            <p className="text-xs text-base-content/60">Redeem your shares for CLAWD. Only available when no game is active.</p>
            <div className="form-control mt-2">
              <div className="join">
                <input
                  type="number"
                  placeholder="Shares"
                  className="input input-bordered join-item w-full"
                  value={withdrawShares}
                  onChange={e => setWithdrawShares(e.target.value)}
                />
                <button
                  className="btn btn-ghost join-item border-base-300"
                  onClick={() => setWithdrawShares(formatUnits(userShares || 0n, 18))}
                >
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
                  disabled={withdrawSubmitting || !withdrawParsed || withdrawParsed === 0n || gameActive}
                >
                  {withdrawSubmitting ? <span className="loading loading-spinner loading-sm" /> : null}
                  {gameActive ? "Game in Progress" : "Withdraw"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
