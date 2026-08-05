import FinanceView from "@/components/dashboard/finance-view";

export const dynamic = "force-dynamic";

export default function ExpensesPage() {
  return <FinanceView kind="expense" />;
}