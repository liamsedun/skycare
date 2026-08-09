// Client-side PDF generation for discharge summaries. Both imports are dynamic
// so the heavy @react-pdf/renderer bundle never touches the server build.
export async function generateDischargePDF(data: unknown): Promise<string> {
  const [{ pdf, Font }, { default: DischargeDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./DischargeDocument"),
  ]);

  // DejaVu Sans covers the Naira sign (U+20A6), which Helvetica does not —
  // without it ward charges render as a broken-bar "¦". The fonts live in
  // public/fonts; they are fetched and embedded as data URLs so the browser
  // renders the real glyphs even offline.
  try {
    const toDataUrl = (buf: ArrayBuffer): string => {
      const bytes = new Uint8Array(buf);
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return `data:font/ttf;base64,${btoa(bin)}`;
    };
    const [regular, bold, oblique, boldOblique] = await Promise.all([
      fetch("/fonts/DejaVuSans.ttf").then((r) => (r.ok ? r.arrayBuffer() : null)),
      fetch("/fonts/DejaVuSans-Bold.ttf").then((r) => (r.ok ? r.arrayBuffer() : null)),
      fetch("/fonts/DejaVuSans-Oblique.ttf").then((r) => (r.ok ? r.arrayBuffer() : null)),
      fetch("/fonts/DejaVuSans-BoldOblique.ttf").then((r) => (r.ok ? r.arrayBuffer() : null)),
    ]);
    const fonts: Array<{ src: string; fontWeight: "normal" | "bold"; fontStyle: "normal" | "italic" }> = [];
    if (regular) fonts.push({ src: toDataUrl(regular), fontWeight: "normal", fontStyle: "normal" });
    if (bold) fonts.push({ src: toDataUrl(bold), fontWeight: "bold", fontStyle: "normal" });
    if (oblique) fonts.push({ src: toDataUrl(oblique), fontWeight: "normal", fontStyle: "italic" });
    if (boldOblique) fonts.push({ src: toDataUrl(boldOblique), fontWeight: "bold", fontStyle: "italic" });
    if (fonts.length > 0) Font.register({ family: "DejaVuSans", fonts });
  } catch {
    // fall back to the built-in font — the document still renders
  }

  const blob = await pdf(<DischargeDocument data={data} />).toBlob();
  return URL.createObjectURL(blob);
}