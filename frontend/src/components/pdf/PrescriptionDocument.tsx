import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";

// ---------------------------------------------------------------------------
// Prescription printout — tenant branding, prescriber/dispenser, pharmacy
// routing (in-house vs external pharmacy) and medication lines with
// dosage / frequency / duration / quantity / refills / instructions.
// ---------------------------------------------------------------------------

const RIBBON = "#1e3a5f";
const MUTED = "#555";

const styles = StyleSheet.create({
  page: {
    paddingTop: 42,
    paddingBottom: 48,
    paddingHorizontal: 34,
    fontSize: 10,
    fontFamily: "DejaVuSans",
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
  metaRow: { marginTop: 2 },
  metaLine: { fontSize: 8.5, color: MUTED, marginTop: 1 },
  qrBlock: { flexDirection: "column", alignItems: "center", marginLeft: 10 },
  qr: { width: 62, height: 62 },
  qrCaption: { fontSize: 5.5, color: MUTED, letterSpacing: 1, marginTop: 2 },

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

  drugRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 0.5,
    borderBottomColor: "#ddd",
    borderBottomStyle: "solid",
    paddingVertical: 5,
  },
  drugName: { fontSize: 9.5, fontWeight: "bold", flex: 1, paddingRight: 12 },
  drugRight: { fontSize: 9, color: "#222", textAlign: "right" },
  drugMeta: { fontSize: 8, color: MUTED, marginTop: 4, fontStyle: "italic" },

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

  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 2,
    borderTopColor: RIBBON,
    borderTopStyle: "solid",
    marginTop: 6,
    paddingTop: 7,
  },
  totalLabel: { fontSize: 10, fontWeight: "bold", color: RIBBON },
  totalValue: { fontSize: 12, fontWeight: "bold", color: "#111" },

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

function fmt(s: string | number | null | undefined): string {
  if (s === null || s === undefined || s === "") return "—";
  return String(s);
}

export default function PrescriptionDocument({ data }: { data: any }) {
  const h = data.hospital ?? {};
  const p = data.patient ?? {};
  const doctor = data.doctor ?? null;
  const dispenser = data.dispenser ?? null;
  const items: Array<{
    medication: string | null;
    dosage: string;
    frequency: string;
    route: string | null;
    duration: string | null;
    quantity: number;
    refills: number;
    dispensedQty: number;
    instructions: string | null;
  }> = data.items ?? [];
  const isExternal = data.pharmacyType === "external";

  return (
    <Document title={`Prescription ${data.id ?? ""}`} author={h.name ?? "Hospital"}>
      <Page size="A4" style={styles.page}>
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
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>PRESCRIPTION</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaLine}>
                Prescription ID: {data.id ?? "—"}   |   Status: {(data.status ?? "").replace(/_/g, " ").toUpperCase()}
              </Text>
              <Text style={styles.metaLine}>
                Issued: {formatDate(data.issuedAt)}{data.expiresAt ? `   |   Expires: ${formatDate(data.expiresAt)}` : ""}
                {data.dispensedAt ? `   |   Dispensed: ${formatDate(data.dispensedAt)}` : ""}
                {isExternal ? `   |   Pharmacy: ${fmt(data.externalPharmacyName)}` : ""}
              </Text>
            </View>
          </View>
          {data.qrCode && (
            <View style={styles.qrBlock}>
              <Image src={data.qrCode} style={styles.qr} />
              <Text style={styles.qrCaption}>VERIFY THIS PRESCRIPTION</Text>
            </View>
          )}
        </View>

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

        {/* Prescriber / dispenser */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personnel</Text>
          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Prescribing doctor</Text>
            <Text style={styles.kvValue}>{doctor?.name ?? "—"}</Text>
          </View>
          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Pharmacist</Text>
            <Text style={styles.kvValue}>{fmt(dispenser?.name ?? (data.dispensedAt ? "Pharmacy" : "—"))}</Text>
          </View>
          {data.dispensedAt && (
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Dispensed on</Text>
              <Text style={styles.kvValue}>{formatDate(data.dispensedAt)}</Text>
            </View>
          )}
        </View>

        {/* Medication lines */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Medications</Text>
          {items.map((it, i) => (
            <View key={i} style={styles.drugRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.drugName}>{fmt(it.medication)}</Text>
<Text style={styles.drugMeta}>
                  {fmt(it.dosage)} {it.route ? `· ${it.route}` : ""}
                  {it.duration ? ` · for ${it.duration}` : ""}
                  {it.instructions ? ` · ${it.instructions}` : ""}
                </Text>
              </View>
              <View style={styles.drugRight}>
                <Text>
                  {it.frequency} · qty {it.quantity}
                </Text>
                <Text style={styles.drugMeta}>
                  {it.refills > 0 ? `refills: ${it.refills} · ` : ""}
                  dispensed: {it.dispensedQty}
                </Text>
              </View>
            </View>
          ))}
          {items.length === 0 && (
            <Text style={styles.notesBox}>No medications listed.</Text>
          )}
        </View>

        {/* Notes */}
        {data.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text style={styles.notesBox}>{data.notes}</Text>
          </View>
        )}

        {/* Total cost */}
        {typeof data.totalCost === "number" && data.totalCost > 0 && (
          <View style={styles.section}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TOTAL COST</Text>
              <Text style={styles.totalValue}>{data.totalCostLabel ?? data.totalCost}</Text>
            </View>
          </View>
        )}

        {/* Signatures */}
        <View style={styles.signatures}>
          <View style={styles.signature}>
            <Text style={styles.signatureLine} />
            <Text style={styles.signatureName}>{doctor?.name ?? " "}</Text>
            <Text style={styles.signatureRole}>Prescribing doctor</Text>
          </View>
          <View style={styles.signature}>
            <Text style={styles.signatureLine} />
            <Text style={styles.signatureName}>{dispenser?.name ?? " "}</Text>
            <Text style={styles.signatureRole}>Pharmacist</Text>
          </View>
        </View>

        {/* Footer ribbon with page numbers — every page */}
        <View style={styles.footerRibbon} fixed>
          <Text
            style={styles.footerRibbonText}
            render={({ pageNumber, totalPages }) =>
              `${(h.name ?? "Hospital").toUpperCase()}  ·  PRESCRIPTION  ·  PAGE ${pageNumber} OF ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}