import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import {
  reconcileDriverTransferAfterLostDispute,
  reconcileDriverTransferAfterRefund,
  transferCapturedRideEarnings,
} from "./taxi-stripe-connect-router";
import { supabase } from "./supabase-client";

function assertAdmin(ctx: any) {
  if (ctx.user?.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Solo administración puede gestionar liquidaciones." });
  }
}

export const taxiFinanceAdminRouter = router({
  getOverview: protectedProcedure.query(async ({ ctx }) => {
    assertAdmin(ctx);

    const [transfersResult, accountsResult] = await Promise.all([
      supabase
        .from("taxi_driver_transfers")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(200),
      supabase
        .from("taxi_driver_connect_accounts")
        .select("driver_id,status,payouts_enabled,charges_enabled,requirements_due,disabled_reason,updated_at")
        .order("updated_at", { ascending: false })
        .limit(200),
    ]);

    if (transfersResult.error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: transfersResult.error.message });
    if (accountsResult.error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: accountsResult.error.message });

    const transfers = transfersResult.data || [];
    const attention = transfers.filter((transfer: any) => transfer.refund_reversal_pending || transfer.status === "failed");
    const paymentIds = attention.map((transfer: any) => transfer.payment_id).filter(Boolean);
    const rideIds = attention.map((transfer: any) => transfer.ride_id).filter(Boolean);

    const [paymentsResult, ridesResult] = await Promise.all([
      paymentIds.length
        ? supabase.from("taxi_payments").select("id,ride_id,driver_id,status,currency,amount_captured,amount_refunded,platform_fee,driver_net").in("id", paymentIds)
        : Promise.resolve({ data: [], error: null } as any),
      rideIds.length
        ? supabase.from("taxi_rides").select("id,driver_id,driver_name,pickup_address,dropoff_address,status,final_fare,payment_method,payment_status,completed_at").in("id", rideIds)
        : Promise.resolve({ data: [], error: null } as any),
    ]);

    if (paymentsResult.error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: paymentsResult.error.message });
    if (ridesResult.error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: ridesResult.error.message });

    const paymentMap = new Map((paymentsResult.data || []).map((payment: any) => [payment.id, payment]));
    const rideMap = new Map((ridesResult.data || []).map((ride: any) => [ride.id, ride]));
    const attentionItems = attention.map((transfer: any) => ({
      transfer,
      payment: paymentMap.get(transfer.payment_id) || null,
      ride: rideMap.get(transfer.ride_id) || null,
    }));

    const totalTransferred = transfers
      .filter((transfer: any) => ["paid", "reversed"].includes(String(transfer.status)))
      .reduce((sum: number, transfer: any) => sum + Number(transfer.amount || 0), 0);
    const totalReversed = transfers.reduce((sum: number, transfer: any) => sum + Number(transfer.amount_reversed || 0), 0);
    const accounts = accountsResult.data || [];
    const restrictedAccounts = accounts.filter((account: any) => account.status !== "enabled" || !account.payouts_enabled);

    return {
      summary: {
        transferCount: transfers.length,
        totalTransferred,
        totalReversed,
        attentionCount: attentionItems.length,
        connectAttentionCount: restrictedAccounts.length,
      },
      attention: attentionItems,
      connectAttention: restrictedAccounts,
      recentTransfers: transfers.slice(0, 50),
    };
  }),

  retryRecovery: protectedProcedure
    .input(z.object({ paymentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx);

      const { data: transfer, error } = await supabase
        .from("taxi_driver_transfers")
        .select("payment_id,dispute_id,payout_blocked_reason")
        .eq("payment_id", input.paymentId)
        .maybeSingle();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      if (!transfer) throw new TRPCError({ code: "NOT_FOUND", message: "Liquidación no encontrada." });

      if (transfer.dispute_id || String(transfer.payout_blocked_reason || "").startsWith("stripe_dispute_lost:")) {
        const { data: dispute, error: disputeError } = await supabase
          .from("taxi_payment_disputes")
          .select("id,amount,status,payout_action")
          .eq("id", transfer.dispute_id)
          .maybeSingle();
        if (disputeError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: disputeError.message });
        if (!dispute) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No se encontró la disputa asociada." });
        if (dispute.payout_action !== "reverse" && dispute.status !== "lost") {
          throw new TRPCError({ code: "CONFLICT", message: "La disputa todavía no exige una reversión definitiva." });
        }
        return reconcileDriverTransferAfterLostDispute(input.paymentId, Number(dispute.amount || 0), dispute.id);
      }

      return reconcileDriverTransferAfterRefund(input.paymentId, ctx.user.openId);
    }),

  retryPayout: protectedProcedure
    .input(z.object({ rideId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx);
      return transferCapturedRideEarnings(input.rideId, ctx.user.openId);
    }),
});
