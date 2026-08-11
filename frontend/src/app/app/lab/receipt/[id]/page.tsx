import LabPaymentReceipt from "@/components/dashboard/lab-payment-receipt";

export const dynamic = "force-dynamic";

export default function LabPaymentReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  return <LabPaymentReceipt params={params} />;
}
