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
    (totalShares || BigInt(0)) > BigInt(0) && totalPooled !== undefined ? (totalPooled * BigInt(10) ** BigInt(18)) / totalShares! : undefined;

  let depositParsed: bigint | undefined;
  try {
    depositParsed = depositAmount ? parseUnits(depositAmount, CLAWD_DECIMALS) : undefined;
  } catch {
    depositParsed = undefined;
  }

  const estimatedShares =
    depositParsed !== undefined && totalShares !== undefined && totalPooled !== undefined
      ? totalShares === BigInt(0) || totalPooled === BigInt(0)
        ? depositParsed
        : (depositParsed * totalShares) / totalPooled
      : undefined;

  let withdrawParsed: bigint | undefined;
  try {
    withdrawParsed = withdrawShares ? parseUnits(withdrawShares, CLAWD_DECIMALS) : undefined;
  } catch {
    withdrawParsed = undefined;
  }

  const withdrawCLAWD =
    withdrawParsed !== undefined && (totalShares || BigInt(0)) > BigInt(0) && totalPooled !== undefined
      ? (withdrawParsed * totalPooled) / totalShares!
      : undefined;

  const needsApproval = depositParsed !== undefined && (allowance === undefined || allowance < depositParsed);

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
      notification.success("Deposited!");
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
      notification.success("Withdrawn!");
      setWithdrawShares("");
    } catch {
      notification.error("Withdraw failed");
    } finally {
      setWithdrawSubmitting(false);
    }
  };

  const poolEmpty = totalPooled !== undefined && totalPooled === BigInt(0);

  return (
    <div className="flex flex-col gap-4">
      {gameActive && (
        <div className="alert alert-warning">
          <span>🔒 Pool locked during active game</span>
        </div>
      )}
      {poolEmpty && (
        <div className="alert alert-info">
          <span>⚠️ This pool requires CLAWD deposits before games can start.</span>
        </div>
      )}

      <div className="card bg-base-200 shadow-md">
        <div className="card-body p-5">
          <h3 className="card-title">Pool Overview</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Stat label="Pool TVL" value={`${fmt(totalPooled)} CLAWD`} />
            <Stat label="Total Shares" value={fmt(totalShares)} />
            <Stat label="Share Value" value={`${fmt(shareValue)} CLAWD`} />
          </div>
          <div className="divider my-1" />
          <div className="flex items-center gap-2 text-sm">
            <span className="text-base-content/70">Pool contract:</span>
            <Address address={POOL_ADDRESS} />
          </div>
          {isConnected && (
            <div className="grid grid-cols-2 gap-4 mt-2">
              <Stat label="Your Shares" value={fmt(userShares)} />
              <Stat label="Your Position" value={`${fmt(userCLAWD)} CLAWD`} />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Deposit */}
        <div className="card bg-base-200 shadow-md">
          <div className="card-body p-5">
            <h3 className="card-title">Deposit</h3>
            <p className="text-sm text-base-content/70">CLAWD balance: {fmt(clawdBalance)}</p>
            <label className="form-control">
              <span className="label-text mb-1">Amount (CLAWD)</span>
              <input
                type="number"
                min="0"
                placeholder="0.0"
                className="input input-bordered bg-base-100"
                value={depositAmount}
                onChange={e => setDepositAmount(e.target.value)}
                disabled={!!gameActive}
              />
            </label>
            {estimatedShares !== undefined && (
              <p className="text-xs text-base-content/60">Estimated shares: {fmt(estimatedShares)}</p>
            )}

            {!isConnected ? (
              <RainbowKitCustomConnectButton />
            ) : !onBase ? (
              <button className="btn btn-primary" onClick={() => switchChain({ chainId: base.id })}>
                Switch to Base
              </button>
            ) : gameActive ? (
              <button className="btn btn-disabled">Pool locked</button>
            ) : needsApproval ? (
              <button
                className="btn btn-secondary"
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
                className="btn btn-primary"
                onClick={handleDeposit}
                disabled={depositSubmitting || !depositParsed}
              >
                {depositSubmitting ? <span className="loading loading-spinner loading-sm" /> : null}
                Deposit
              </button>
            )}
          </div>
        </div>

        {/* Withdraw */}
        <div className="card bg-base-200 shadow-md">
          <div className="card-body p-5">
            <h3 className="card-title">Withdraw</h3>
            <p className="text-sm text-base-content/70">Your shares: {fmt(userShares)}</p>
            <label className="form-control">
              <span className="label-text mb-1">Shares to burn</span>
              <input
                type="number"
                min="0"
                placeholder="0.0"
                className="input input-bordered bg-base-100"
                value={withdrawShares}
                onChange={e => setWithdrawShares(e.target.value)}
                disabled={!!gameActive}
              />
            </label>
            {withdrawCLAWD !== undefined && (
              <p className="text-xs text-base-content/60">You receive: {fmt(withdrawCLAWD)} CLAWD</p>
            )}

            {!isConnected ? (
              <RainbowKitCustomConnectButton />
            ) : !onBase ? (
              <button className="btn btn-primary" onClick={() => switchChain({ chainId: base.id })}>
                Switch to Base
              </button>
            ) : gameActive ? (
              <button className="btn btn-disabled">Pool locked</button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={handleWithdraw}
                disabled={withdrawSubmitting || !withdrawParsed}
              >
                {withdrawSubmitting ? <span className="loading loading-spinner loading-sm" /> : null}
                Withdraw
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div>
    <div className="text-xs uppercase text-base-content/60">{label}</div>
    <div className="text-lg font-semibold">{value}</div>
  </div>
);
// Forced change to trigger Vercel deployment
