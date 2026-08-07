import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";

// ---------------------------------------------------------------------------
// Lab request printout — tenant branding (name/logo/address/email/phone),
// requesting doctor, lab clinician/technician, and a CONFIDENTIAL stamp on
// every page (diagonal watermark + header/footer ribbons).
// ---------------------------------------------------------------------------

const RIBBON = "#7f1d1d";
const MUTED = "#555";

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
  // ---- watermark: repeated CONFIDENTIAL grid, fixed across all pages ----
  watermark: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    transform: "rotate(-32deg)",
    transformOrigin: "center",
  },
  watermarkRow: { flexDirection: "row", justifyContent: "space-around", marginVertical: 46 },
  watermarkText: {
    fontSize: 26,
    fontWeight: "bold",
    letterSpacing: 6,
    color: "#c0c0c0",
    opacity: 0.35,
  },
  // ---- fixed header ribbon ----
  headerRibbon: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: RIBBON,
    paddingVertical: 4,
  },
  headerRibbonText: {
    color: "#ffffff",
    fontSize: 8,
    fontWeight: "bold",
    letterSpacing: 4,
    textAlign: "center",
  },
  // ---- fixed footer ribbon with page numbers ----
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
  footerRibbonText: {
    color: "#ffffff",
    fontSize: 8,
    fontWeight: "bold",
    letterSpacing: 4,
  },

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

  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  title: { fontSize: 13, fontWeight: "bold", color: RIBBON },
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
  kvLabel: { width: 120, color: MUTED },
  kvValue: { flex: 1, fontWeight: "bold" },

  table: { marginTop: 4 },
  tableHead: {
    flexDirection: "row",
    backgroundColor: "#f2f2f2",
    borderBottomWidth: 1,
    borderBottomColor: "#999",
    borderBottomStyle: "solid",
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#ddd",
    borderBottomStyle: "solid",
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  thService: { width: "44%", fontSize: 8, fontWeight: "bold", color: "#333" },
  thPriority: { width: "14%", fontSize: 8, fontWeight: "bold", color: "#333" },
  thSample: { width: "16%", fontSize: 8, fontWeight: "bold", color: "#333" },
  thNotes: { width: "26%", fontSize: 8, fontWeight: "bold", color: "#333" },
  tdService: { width: "44%", fontSize: 9 },
  tdPriority: { width: "14%", fontSize: 9, textTransform: "capitalize" },
  tdSample: { width: "16%", fontSize: 9 },
  tdNotes: { width: "26%", fontSize: 9 },

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

  signatures: {
    flexDirection: "row",
    marginTop: 46,
  },
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

function money(amount: number | null | undefined, currency: string): string {
  const n = Number(amount ?? 0);
  const formatted = n.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return currency === "NGN" ? `₦${formatted}` : `${currency} ${formatted}`;
}

export default function LabRequestDocument({ data }: { data: any }) {
  const h = data.hospital ?? {};
  const p = data.patient ?? {};
  const doctor = data.doctor ?? null;
  const requester = data.requester ?? null;
  const technician = data.technician ?? null;
  const services: Array<{ name: string; priority: string; sampleType: string | null; notes: string | null }> =
    data.services ?? [];
  const requestedByName = doctor?.name ?? requester?.full_name ?? "—";

  return (
    <Document title={`Lab Request ${data.id ?? ""}`} author={h.name ?? "Hospital"}>
      <Page size="A4" style={styles.page}>
        {/* CONFIDENTIAL watermark — repeats on every page */}
        <View style={styles.watermark} fixed>
          {[0, 1, 2, 3].map((r) => (
            <View key={r} style={styles.watermarkRow}>
              {[0, 1, 2].map((c) => (
                <Text key={c} style={styles.watermarkText}>CONFIDENTIAL</Text>
              ))}
            </View>
          ))}
        </View>

        {/* CONFIDENTIAL header ribbon — every page */}
        <View style={styles.headerRibbon} fixed>
          <Text style={styles.headerRibbonText}>CONFIDENTIAL — LABORATORY DOCUMENT</Text>
        </View>

        {/* Header */}
        <View style={styles.header}>
          {h.logo && <Image src={h.logo} style={styles.logo} />}
          <View>
            <Text style={styles.hospitalName}>{h.name ?? "Hospital"}</Text>
            <Text style={styles.hospitalMeta}>{[h.address, h.email, h.phone].filter(Boolean).join("  |  ")}</Text>
          </View>
        </View>

        {/* Title */}
        <View style={styles.titleRow}>
          <Text style={styles.title}>LABORATORY REQUEST</Text>
          <Text style={styles.title}>
            {data.isExternal ? "EXTERNAL LAB" : "IN-HOUSE LAB"}
          </Text>
        </View>
        <Text style={styles.metaLine}>
          Request ID: {data.id ?? "—"}   |   Status: {(data.status ?? "").replace(/_/g, " ").toUpperCase()}
        </Text>
        <Text style={styles.metaLine}>
          Requested: {formatDate(data.requestedAt)}   |   Completed: {formatDate(data.completedAt)}
          {data.isExternal && data.externalLabId ? `   |   External lab: ${data.externalLabId}` : ""}
        </Text>

        {/* Patient */}
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
            <Text style={styles.kvValue}>
              {p.age != null ? `${p.age} years` : "—"} / {p.gender ?? "—"}
            </Text>
          </View>
          {p.isDependant && (
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Main account</Text>
              <Text style={styles.kvValue}>{p.mainPatientName ?? "—"}</Text>
            </View>
          )}
        </View>

        {/* Personnel */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personnel</Text>
          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Requesting doctor</Text>
            <Text style={styles.kvValue}>{requestedByName}</Text>
          </View>
          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Lab clinician / technician</Text>
            <Text style={styles.kvValue}>{technician?.full_name ?? "—"}</Text>
          </View>
        </View>

        {/* Services */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Requested Services</Text>
          <View style={styles.table}>
            <View style={styles.tableHead}>
              <Text style={styles.thService}>Service</Text>
              <Text style={styles.thPriority}>Priority</Text>
              <Text style={styles.thSample}>Sample type</Text>
              <Text style={styles.thNotes}>Notes</Text>
            </View>
            {services.map((s, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={styles.tdService}>{s.name}</Text>
                <Text style={styles.tdPriority}>{s.priority ?? "routine"}</Text>
                <Text style={styles.tdSample}>{s.sampleType ?? "—"}</Text>
                <Text style={styles.tdNotes}>{s.notes ?? "—"}</Text>
              </View>
            ))}
            {services.length === 0 && (
              <View style={styles.tableRow}>
                <Text style={styles.tdService}>No services listed.</Text>
              </View>
            )}
          </View>
        </View>

        {/* Notes */}
        {data.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text style={styles.notesBox}>{data.notes}</Text>
          </View>
        )}

        {/* Signatures */}
        <View style={styles.signatures}>
          <View style={styles.signature}>
            <Text style={styles.signatureLine} />
            <Text style={styles.signatureName}>{requestedByName}</Text>
            <Text style={styles.signatureRole}>Requesting doctor</Text>
          </View>
          <View style={styles.signature}>
            <Text style={styles.signatureLine} />
            <Text style={styles.signatureName}>{technician?.full_name ?? " "}</Text>
            <Text style={styles.signatureRole}>Lab clinician / technician</Text>
          </View>
        </View>

        {/* CONFIDENTIAL footer ribbon with page numbers — every page */}
        <View style={styles.footerRibbon} fixed>
          <Text
            style={styles.footerRibbonText}
            render={({ pageNumber, totalPages }) =>
              `CONFIDENTIAL — FOR AUTHORIZED USE ONLY  ·  PAGE ${pageNumber} OF ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
