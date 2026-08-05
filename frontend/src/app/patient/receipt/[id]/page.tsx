import PatientReceipt from "@/components/patient/patient-receipt";

export const dynamic = "force-dynamic";

export default function PatientReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  return <PatientReceipt params={params} />;
}