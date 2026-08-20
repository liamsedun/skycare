"use client";

// ============================================================================
// Vendor Purchasing — the money side of Suppliers & Procurement.
//   BalancesTab      bought vs paid vs outstanding per supplier
//   PurchaseOrdersTab  PO lifecycle: draft → sent → approved → received
//   PaymentsTab      instant bank transfer / cash / POS or credit-on-account
// ============================================================================
export { BalancesTab } from "./vendor-purchasing/vendor-purchasing-balances-tab";
export { PurchaseOrdersTab } from "./vendor-purchasing/vendor-purchasing-po-tab";
export { PaymentsTab } from "./vendor-purchasing/vendor-purchasing-payments-tab";
