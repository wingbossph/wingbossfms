import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { pdfLogo } from "./logo";
import { formatPeso } from "@/lib/money";

export type PayslipDoc = {
  business: string;
  period: string;
  payDate: string;
  employee: { name: string; code: string; position: string; ids: string };
  attendance: string;
  earnings: { label: string; amount: bigint }[];
  deductions: { label: string; amount: bigint }[];
  employer: { label: string; amount: bigint }[];
  gross: bigint;
  totalDeductions: bigint;
  net: bigint;
  notes: string[];
};

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 9, fontFamily: "Helvetica" },
  brand: { fontSize: 10, letterSpacing: 2, fontFamily: "Helvetica-Bold" },
  logo: { width: 54, height: 36, marginBottom: 2 },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 2 },
  muted: { color: "#555" },
  box: { borderWidth: 1, borderColor: "#000", padding: 8, marginTop: 10 },
  cols: { flexDirection: "row", gap: 12, marginTop: 10 },
  col: { flex: 1 },
  head: { fontFamily: "Helvetica-Bold", borderBottomWidth: 1, borderBottomColor: "#000", paddingBottom: 2, marginBottom: 3 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1.5 },
  total: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#000", paddingTop: 3, marginTop: 3, fontFamily: "Helvetica-Bold" },
  net: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#000", color: "#fff", padding: 8, marginTop: 12, fontSize: 13, fontFamily: "Helvetica-Bold" },
  sign: { flexDirection: "row", gap: 24, marginTop: 28 },
  line: { flex: 1, borderTopWidth: 0.5, borderTopColor: "#000", paddingTop: 2, fontSize: 7, color: "#555" },
});

const peso = (c: bigint) => `PHP ${formatPeso(c, { symbol: false })}`;

function Rows({ title, rows, total }: { title: string; rows: { label: string; amount: bigint }[]; total?: { label: string; amount: bigint } }) {
  return (
    <View style={s.col}>
      <Text style={s.head}>{title}</Text>
      {rows.length === 0 && <Text style={s.muted}>None</Text>}
      {rows.map((r, i) => (
        <View key={i} style={s.row}>
          <Text>{r.label}</Text>
          <Text>{formatPeso(r.amount, { symbol: false })}</Text>
        </View>
      ))}
      {total && (
        <View style={s.total}>
          <Text>{total.label}</Text>
          <Text>{formatPeso(total.amount, { symbol: false })}</Text>
        </View>
      )}
    </View>
  );
}

export function PayslipsPdf({ slips }: { slips: PayslipDoc[] }) {
  return (
    <Document title="Payslips">
      {slips.map((p, i) => (
        <Page key={i} size="A5" orientation="landscape" style={s.page}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf images have no alt */}
          {pdfLogo() && <Image style={s.logo} src={pdfLogo()!} />}
          <Text style={s.brand}>{p.business.toUpperCase()}</Text>
          <Text style={s.title}>Payslip · {p.period}</Text>
          <Text style={s.muted}>Pay date {p.payDate}</Text>
          <View style={s.box}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>
              {p.employee.name} ({p.employee.code}) · {p.employee.position}
            </Text>
            {p.employee.ids ? <Text style={s.muted}>{p.employee.ids}</Text> : null}
            <Text style={s.muted}>{p.attendance}</Text>
          </View>
          <View style={s.cols}>
            <Rows title="Earnings" rows={p.earnings} total={{ label: "Gross pay", amount: p.gross }} />
            <Rows title="Deductions" rows={p.deductions} total={{ label: "Total deductions", amount: p.totalDeductions }} />
            <Rows title="Employer pays (not deducted)" rows={p.employer} />
          </View>
          <View style={s.net}>
            <Text>NET PAY</Text>
            <Text>{peso(p.net)}</Text>
          </View>
          {p.notes.map((n, j) => (
            <Text key={j} style={[s.muted, { marginTop: 4, fontSize: 7 }]}>
              {n}
            </Text>
          ))}
          <View style={s.sign}>
            <Text style={s.line}>Received by (signature over printed name)</Text>
            <Text style={s.line}>Date</Text>
          </View>
        </Page>
      ))}
    </Document>
  );
}
