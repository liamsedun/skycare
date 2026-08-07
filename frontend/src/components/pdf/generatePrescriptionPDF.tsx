// Client-side PDF generation for prescriptions. Both imports are dynamic so
// the heavy @react-pdf/renderer bundle never touches the server build.
export async function generatePrescriptionPDF(data: unknown): Promise<string> {
  const [{ pdf }, { default: PrescriptionDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./PrescriptionDocument"),
  ]);
  const blob = await pdf(<PrescriptionDocument data={data} />).toBlob();
  return URL.createObjectURL(blob);
}