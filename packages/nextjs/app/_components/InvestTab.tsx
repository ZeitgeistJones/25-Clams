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
    totalShares && totalShares > 0n && totalPooled !== undefined ? (totalPooled * 10n ** 18n) / totalShares : undefined;

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
      const shares = parseUnits(withdrawShares, 18);
      await writePool({ functionName: "withdraw", args: [shares] });
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card bg-base-200 shadow-md">
          <div className="card-body p-5">
            <div className="text-xs uppercase text-base-content/60">Total Pooled</div>
            <div className="text-2xl font-bold">{fmt(totalPooled)} CLAWD</div>
          </div>
        </div>
        <div className="card bg-base-200 shadow-md">
          <div className="card-body p-5">
            <div className="text-xs uppercase text-base-content/60">Share Value</div>
            <div className="text-2xl font-bold">
              {shareValue !== undefined
                ? Number(formatUnits(shareValue, 18)).toLocaleString(undefined, { maximumFractionDigits: 6 })
                : "—"}{" "}
              CLAWD
            </div>
          </div>
        </div>
        <div className="card bg-base-200 shadow-md">
          <div className="card-body p-5">
            <div className="text-xs uppercase text-base-content/60">Pool Status</div>
            <div className="text-2xl font-bold">{gameActive ? "Locked (Game Active)" : "Open"}</div>
          </div>
        </div>
      </div>

      {/* User Stats */}
      {isConnected && (
        <div className="card bg-base-200 shadow-md border border-primary/20">
          <div className="card-body p-5 flex-row flex-wrap justify-between items-center gap-4">
            <div>
              <div className="text-xs uppercase text-base-content/60">Your Shares</div>
              <div className="text-xl font-bold">
                {userShares !== undefined
                  ? Number(formatUnits(userShares, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 })
                  : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-base-content/60">Value</div>
              <div className="text-xl font-bold">{fmt(userCLAWD)} CLAWD</div>
            </div>
            <div>
              <div className="text-xs uppercase text-base-content/60">Wallet Balance</div>
              <div className="text-xl font-bold">{fmt(clawdBalance)} CLAWD</div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Deposit */}
        <div className="card bg-base-200 shadow-md">
          <div className="card-body p-5">
            <h3 className="card-title">Deposit</h3>
            <p className="text-sm text-base-content/70">Add CLAWD to the pool to earn from game entry fees.</p>

            <div className="form-control mt-2">
              <div className="input-group">
                <input
                  type="number"
                  placeholder="Amount"
                  className="input input-bordered w-full"
                  value={depositAmount}
                  onChange={e => setDepositAmount(e.target.value)}
                />
                <button className="btn btn-ghost btn-sm absolute right-2 top-3" onClick={() => setDepositAmount(formatUnits(clawdBalance ?? 0n, CLAWD_DECIMALS))}>
                  MAX
                </button>
              </div>
            </div>

            <div className="mt-4">
              {walletGate ? (
                walletGate
              ) : gameActive ? (
                <button className="btn btn-disabled w-full">Pool Locked</button>
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
                  disabled={depositSubmitting || !depositParsed}
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
            <p className="text-sm text-base-content/70">Redeem your shares for CLAWD.</p>

            <div className="form-control mt-2">
              <div className="input-group">
                <input
                  type="number"
                  placeholder="Shares"
                  className="input input-bordered w-full"
                  value={withdrawShares}
                  onChange={e => setWithdrawShares(e.target.value)}
                />
                <button className="btn btn-ghost btn-sm absolute right-2 top-3" onClick={() => setWithdrawShares(formatUnits(userShares ?? 0n, 18))}>
                  MAX
                </button>
              </div>
            </div>

            <div className="mt-4">
              {walletGate ? (
                walletGate
              ) : gameActive ? (
                <button className="btn btn-disabled w-full">Pool Locked</button>
              ) : (
                <button
                  className="btn btn-primary w-full"
                  onClick={handleWithdraw}
                  disabled={withdrawSubmitting || !withdrawShares}
                >
                  {withdrawSubmitting ? <span className="loading loading-spinner loading-sm" /> : null}
                  Withdraw
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="alert alert-info shadow-sm">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <div className="text-sm">
          <p className="font-bold">How it works:</p>
          <p>Investors provide the liquidity for the game jackpot. In return, they receive 100% of the entry fees from every game played, distributed proportionally to their share of the pool.</p>
        </div>
      </div>
    </div>
  );
};
