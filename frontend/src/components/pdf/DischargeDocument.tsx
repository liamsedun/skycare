import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";

// ---------------------------------------------------------------------------
// Discharge summary printout — tenant branding, patient + admission window,
// ward/bed, diagnosis, treatment summary, medications, follow-up and rounds.
// ---------------------------------------------------------------------------

const RIBBON = "#1e3a8a";
const MUTED = "#555";

type MedRow = { name?: string; dosage?: string; dose?: string | number; frequency?: string; days?: string | number; duration?: string | number };

const styles = StyleSheet.create({
  page: {
    paddingTop: 42,
    paddingBottom: 48,
    paddingHorizontal: 34,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#111",
    position: "relative",
  },
  footerRibbon: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: RIBBON,
    paddingVertical: 4,
    flexDirection: "row",
    justifyContent: "center",
  },
  footerRibbonText: { color: "#ffffff", fontSize: 8, fontWeight: "bold", letterSpacing: 4 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 2,
    borderBottomColor: RIBBON,
    borderBottomStyle: "solid",
    paddingBottom: 10,
    marginBottom: 12,
  },
  logo: { width: 56, height: 56, objectFit: "contain" },
  hospitalName: { fontSize: 16, fontWeight: "bold", color: "#111" },
  hospitalMeta: { fontSize: 8.5, color: MUTED, marginTop: 2 },
  title: { fontSize: 13, fontWeight: "bold", color: RIBBON, marginBottom: 4 },
  metaLine: { fontSize: 8.5, color: MUTED, marginTop: 1 },
  section: { marginTop: 12 },
  sectionTitle: {
    fontSize: 9,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#333",
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
    borderBottomStyle: "solid",
    paddingBottom: 3,
    marginBottom: 6,
  },
  kvRow: { flexDirection: "row", marginBottom: 3 },
  kvLabel: { width: 150, color: MUTED },
  kvValue: { flex: 1, fontWeight: "bold" },
  notesBox: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: "#ccc",
    borderStyle: "solid",
    borderRadius: 3,
    padding: 8,
    fontSize: 9,
    color: "#222",
  },
  medRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 0.5,
    borderBottomColor: "#ddd",
    borderBottomStyle: "solid",
    paddingVertical: 4,
  },
  medName: { fontSize: 9, fontWeight: "bold", flex: 1, paddingRight: 12 },
  medMeta: { fontSize: 9, color: "#222" },
  signatures: { flexDirection: "row", marginTop: 46 },
  signature: { flex: 1 },
  signatureLine: {
    borderTopWidth: 1,
    borderTopColor: "#333",
    borderTopStyle: "solid",
    width: "70%",
    marginBottom: 5,
  },
  signatureName: { fontSize: 9, fontWeight: "bold" },
  signatureRole: { fontSize: 8, color: MUTED, marginTop: 1 },
});

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function medText(m: MedRow): string {
  const bits: string[] = [];
  if (m?.name) bits.push(m.name);
  if (m?.dosage) bits.push(m.dosage);
  if (m?.dose) bits.push(String(m.dose));
  if (m?.frequency) bits.push(m.frequency);
  if (m?.days || m?.duration) bits.push(`${m?.days ?? m?.duration} days`);
  return bits.join("  ·  ") || "—";
}

export default function DischargeDocument({ data }: { data: any }) {
  const h = data.hospital ?? {};
  const p = data.patient ?? {};
  const w = data.ward ?? {};
  const doctor = data.doctor ?? null;
  const dischargedBy = data.dischargedBy ?? null;
  const medications: unknown[] = data.medications ?? [];
  const rounds: Array<{ at: string; vitals: Record<string, unknown>; notes: string | null }> = data.rounds ?? [];

  return (
    <Document title={`Discharge Summary ${data.id ?? ""}`} author={h.name ?? "Hospital"}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {h.logo && <Image src={h.logo} style={styles.logo} />}
          <View>
            <Text style={styles.hospitalName}>{h.name ?? "Hospital"}</Text>
            <Text style={styles.hospitalMeta}>{[h.address, h.email, h.phone].filter(Boolean).join("  |  ")}</Text>
          </View>
        </View>

        <Text style={styles.title}>DISCHARGE SUMMARY</Text>
        <Text style={styles.metaLine}>
          Admission: {formatDate(data.admittedAt)} — {formatDate(data.dischargedAt)}
          {data.expectedDischarge ? `   |   Expected: ${formatDate(data.expectedDischarge)}` : ""}
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Patient</Text>
          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Name</Text>
            <Text style={styles.kvValue}>{p.name ?? "Unknown"}</Text>
          </View>
          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Patient No.</Text>
            <Text style={styles.kvValue}>{p.patientNumber ?? "—"}</Text>
          </View>
          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Age / Gender</Text>
            <Text style={styles.kvValue}>{p.age != null ? `${p.age} years` : "—"} / {p.gender ?? "—"}</Text>
          </View>
          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Ward / Bed</Text>
            <Text style={styles.kvValue}>{w.name ?? "—"}{w.bedNumber ? ` · Bed ${w.bedNumber}` : ""}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Diagnosis with admission</Text>
          <Text style={styles.notesBox}>{data.diagnosis ?? "—"}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Discharge Summary</Text>
          <Text style={styles.notesBox}>{data.summary ?? "—"}</Text>
        </View>

        {data.followUp && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Follow-up instructions</Text>
            <Text style={styles.notesBox}>{data.followUp}</Text>
          </View>
        )}

        {medications.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Medications on discharge</Text>
            {medications.map((m: unknown, i) => (
              <View key={i} style={styles.medRow}>
                <Text style={styles.medName}>{(m as MedRow)?.name ?? "—"}</Text>
                <Text style={styles.medMeta}>{medText(m as MedRow)}</Text>
              </View>
            ))}
          </View>
        )}

        {rounds.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Last ward round</Text>
            {rounds.slice(0, 2).map((r, i) => (
              <View key={i} style={styles.notesBox}>
                <Text>{r.notes ?? "—"}</Text>
                {r.vitals && Object.keys(r.vitals).length > 0 && (
                  <Text style={{ marginTop: 4, color: MUTED }}>
                    Vitals: {Object.entries(r.vitals).map(([k, v]) => `${k}: ${String(v)}`).join("  |  ")}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        <View style={styles.signatures}>
          <View style={styles.signature}>
            <Text style={styles.signatureLine} />
            <Text style={styles.signatureName}>{doctor?.name ?? " "}</Text>
            <Text style={styles.signatureRole}>Attending doctor</Text>
          </View>
          <View style={styles.signature}>
            <Text style={styles.signatureLine} />
            <Text style={styles.signatureName}>{dischargedBy?.full_name ?? " "}</Text>
            <Text style={styles.signatureRole}>Discharged by</Text>
          </View>
        </View>

        <View style={styles.footerRibbon} fixed>
          <Text
            style={styles.footerRibbonText}
            render={({ pageNumber, totalPages }) =>
              `${(h.name ?? "Hospital").toUpperCase()}  ·  DISCHARGE SUMMARY  ·  PAGE ${pageNumber} OF ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}