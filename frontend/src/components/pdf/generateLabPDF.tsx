// Client-side PDF generation for lab requests. Both imports are dynamic so
// the heavy @react-pdf/renderer bundle never touches the server build.
export async function generateLabPDF(data: unknown): Promise<string> {
  const [{ pdf }, { default: LabRequestDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./LabRequestDocument"),
  ]);
  const blob = await pdf(<LabRequestDocument data={data} />).toBlob();
  return URL.createObjectURL(blob);
}
