// Client-side PDF generation for discharge summaries. Both imports are dynamic
// so the heavy @react-pdf/renderer bundle never touches the server build.
export async function generateDischargePDF(data: unknown): Promise<string> {
  const [{ pdf }, { default: DischargeDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./DischargeDocument"),
  ]);
  const blob = await pdf(<DischargeDocument data={data} />).toBlob();
  return URL.createObjectURL(blob);
}