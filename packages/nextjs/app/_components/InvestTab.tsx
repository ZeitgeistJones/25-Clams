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

  const needsApproval = (allowance ?? 0n) < (depositParsed ?? 0n) || (allowance ?? 0n) === 0n;

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
    <div className="flex flex-col gap-6">
      {/* Pool Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card bg-base-200 shadow-md">
          <div className="card-body p-5">
            <h3 className="text-xs uppercase text-base-content/60 font-bold">Total Pool Value</h3>
            <div className="text-2xl font-bold">{fmt(totalPooled)} CLAWD</div>
            <div className="text-xs text-base-content/50 mt-1">
              {totalShares ? `${Number(formatUnits(totalShares, 18)).toLocaleString()} total shares` : "—"}
            </div>
          </div>
        </div>
        <div className="card bg-base-200 shadow-md">
          <div className="card-body p-5">
            <h3 className="text-xs uppercase text-base-content/60 font-bold">Share Price</h3>
            <div className="text-2xl font-bold">
              {shareValue ? `${Number(formatUnits(shareValue, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 })} CLAWD` : "1.0000 CLAWD"}
            </div>
            <div className="text-xs text-base-content/50 mt-1">Value of 1.0000 share</div>
          </div>
        </div>
      </div>

      {/* User Stats */}
      {isConnected && (
        <div className="card bg-primary text-primary-content shadow-lg">
          <div className="card-body p-5">
            <h3 className="text-xs uppercase opacity-70 font-bold">Your Investment</h3>
            <div className="flex justify-between items-end">
              <div>
                <div className="text-3xl font-bold">{fmt(userCLAWD)} CLAWD</div>
                <div className="text-sm opacity-80">
                  {userShares ? `${Number(formatUnits(userShares, 18)).toLocaleString()} shares` : "0 shares"}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs opacity-70">Wallet Balance</div>
                <div className="font-semibold">{fmt(clawdBalance)} CLAWD</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Deposit */}
        <div className="card bg-base-200 shadow-md">
          <div className="card-body p-5">
            <h3 className="card-title text-sm font-bold mb-4">Deposit CLAWD</h3>
            <div className="flex flex-col gap-3">
              <div className="join w-full">
                <input
                  type="number"
                  placeholder="Amount"
                  className="input input-bordered join-item w-full"
                  value={depositAmount}
                  onChange={e => setDepositAmount(e.target.value)}
                />
                <button
                  className="btn btn-ghost join-item border border-base-300"
                  onClick={() => setDepositAmount(formatUnits(clawdBalance || 0n, CLAWD_DECIMALS))}
                >
                  MAX
                </button>
              </div>

              {walletGate ? (
                walletGate
              ) : needsApproval ? (
                <button
                  className="btn btn-primary w-full"
                  onClick={handleApprove}
                  disabled={approvalSubmitting || approvalCooldown || !depositAmount || Number(depositAmount) <= 0}
                >
                  {approvalSubmitting ? <span className="loading loading-spinner loading-sm" /> : null}
                  Approve CLAWD
                </button>
              ) : (
                <button
                  className="btn btn-primary w-full"
                  onClick={handleDeposit}
                  disabled={depositSubmitting || !depositAmount || Number(depositAmount) <= 0}
                >
                  {depositSubmitting ? <span className="loading loading-spinner loading-sm" /> : null}
                  Deposit
                </button>
              )}
            </div>
            <p className="text-[10px] text-base-content/50 mt-2">
              Invest in the pool to earn from game entry fees and forfeits.
            </p>
          </div>
        </div>

        {/* Withdraw */}
        <div className="card bg-base-200 shadow-md">
          <div className="card-body p-5">
            <h3 className="card-title text-sm font-bold mb-4">Withdraw Shares</h3>
            <div className="flex flex-col gap-3">
              <div className="join w-full">
                <input
                  type="number"
                  placeholder="Shares"
                  className="input input-bordered join-item w-full"
                  value={withdrawShares}
                  onChange={e => setWithdrawShares(e.target.value)}
                />
                <button
                  className="btn btn-ghost join-item border border-base-300"
                  onClick={() => setWithdrawShares(formatUnits(userShares || 0n, 18))}
                >
                  MAX
                </button>
              </div>

              {walletGate ? (
                walletGate
              ) : (
                <button
                  className="btn btn-outline w-full"
                  onClick={handleWithdraw}
                  disabled={withdrawSubmitting || !withdrawShares || Number(withdrawShares) <= 0 || !!gameActive}
                >
                  {withdrawSubmitting ? <span className="loading loading-spinner loading-sm" /> : null}
                  {gameActive ? "Game in Progress" : "Withdraw"}
                </button>
              )}
            </div>
            <p className="text-[10px] text-base-content/50 mt-2">
              {gameActive
                ? "Withdrawals are disabled while a game is active to protect the pool."
                : "Withdraw your shares to receive CLAWD plus your portion of the earnings."}
            </p>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="alert shadow-sm text-xs">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          className="stroke-info shrink-0 w-6 h-6"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          ></path>
        </svg>
        <div>
          <h3 className="font-bold">How it works</h3>
          <p>
            The Clams Pool funds the game jackpots. Investors earn 100% of the entry fees and any forfeited jackpots.
            When you deposit, you receive shares representing your portion of the pool.
          </p>
        </div>
      </div>
    </div>
  );
};
