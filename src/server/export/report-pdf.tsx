import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatCell, type ReportColumn, type ReportDoc, type ReportRow } from "@/domains/reports/doc";

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 8, fontFamily: "Helvetica", color: "#000" },
  brand: { fontSize: 9, letterSpacing: 2, fontFamily: "Helvetica-Bold" },
  title: { fontSize: 15, fontFamily: "Helvetica-Bold", marginTop: 4 },
  subtitle: { fontSize: 9, color: "#444", marginBottom: 10 },
  header: { flexDirection: "row", backgroundColor: "#000", color: "#fff", fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ddd" },
  cell: { paddingVertical: 3, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 12, marginBottom: 4 },
  note: { fontSize: 7, color: "#555", marginTop: 6 },
  footer: { position: "absolute", bottom: 14, left: 28, right: 28, fontSize: 7, color: "#777", flexDirection: "row", justifyContent: "space-between" },
});

function Table({ columns, rows }: { columns: ReportColumn[]; rows: ReportRow[] }) {
  const first = columns.length > 6 ? 28 : 40;
  const rest = (100 - first) / Math.max(1, columns.length - 1);
  const width = (i: number) => `${i === 0 ? first : rest}%`;
  return (
    <View>
      <View style={styles.header} fixed>
        {columns.map((c, i) => (
          <Text key={c.key} style={[styles.cell, { width: width(i), textAlign: c.kind === "text" ? "left" : "right" }]}>
            {c.label}
          </Text>
        ))}
      </View>
      {rows.map((r, ri) => {
        const bold = r.style === "section" || r.style === "subtotal" || r.style === "total";
        return (
          <View
            key={ri}
            wrap={false}
            style={[styles.row, r.style === "total" ? { borderTopWidth: 1, borderTopColor: "#000", borderBottomWidth: 1.5, borderBottomColor: "#000" } : {}, r.style === "section" ? { backgroundColor: "#f2f2f2" } : {}]}
          >
            {columns.map((c, i) => (
              <Text
                key={c.key}
                style={[
                  styles.cell,
                  { width: width(i), textAlign: c.kind === "text" ? "left" : "right", fontFamily: bold ? "Helvetica-Bold" : "Helvetica", color: r.style === "muted" ? "#777" : "#000" },
                  i === 0 && r.indent ? { paddingLeft: 4 + r.indent * 10 } : {},
                ]}
              >
                {formatCell(r.cells[c.key] ?? null, c.kind)}
              </Text>
            ))}
          </View>
        );
      })}
    </View>
  );
}

export function ReportPdf({ doc }: { doc: ReportDoc }) {
  const landscape = doc.columns.length > 5;
  const printed = new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
  return (
    <Document title={doc.title} author="Wingboss FMS">
      <Page size="A4" orientation={landscape ? "landscape" : "portrait"} style={styles.page}>
        <Text style={styles.brand}>WINGBOSS</Text>
        <Text style={styles.title}>{doc.title}</Text>
        {doc.subtitle && <Text style={styles.subtitle}>{doc.subtitle}</Text>}
        <Table columns={doc.columns} rows={doc.rows} />
        {(doc.sections ?? []).map((s) => (
          <View key={s.title} wrap={false}>
            <Text style={styles.sectionTitle}>{s.title}</Text>
            <Table columns={s.columns} rows={s.rows} />
          </View>
        ))}
        {(doc.notes ?? []).map((n) => (
          <Text key={n} style={styles.note}>
            {n}
          </Text>
        ))}
        <View style={styles.footer} fixed>
          <Text>Printed {printed}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
