import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
  type TooltipContentProps,
} from "recharts";
import { money, monthLabel, monthYear, shortMoney } from "../shared/format";
import type { Dashboard } from "./hooks";

const axis = { fontSize: 11, fontFamily: "JetBrains Mono, monospace", fill: "#5b7a84" };

function MoneyTip({ active, payload, label }: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div>{monthYear(String(label))}</div>
      <b>{money(Number(payload[0].value))}</b> won
    </div>
  );
}

function CountTip({ active, payload, label }: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload?.length) return null;
  const won = payload.find((p) => p.dataKey === "won_count")?.value ?? 0;
  const lost = payload.find((p) => p.dataKey === "lost_count")?.value ?? 0;
  return (
    <div className="chart-tooltip">
      <div>{monthYear(String(label))}</div>
      <b>{won}</b> won, <b>{lost}</b> lost
    </div>
  );
}

/** H2: revenue won per month, Sea Green with the page's one gradient under it. */
export function RevenueChart({ months }: { months: Dashboard["months"] }) {
  return (
    <div className="chart" role="img" aria-label={`Revenue won per month: ${months.map((m) => `${monthYear(m.month)} ${money(m.won_value)}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={months} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06d6a0" stopOpacity={0.32} />
              <stop offset="100%" stopColor="#06d6a0" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#e3eaec" />
          <XAxis dataKey="month" tickFormatter={monthLabel} tick={axis} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={shortMoney} tick={axis} axisLine={false} tickLine={false} width={56} />
          <Tooltip content={<MoneyTip />} cursor={{ stroke: "#cdd8db" }} />
          <Area
            type="linear"
            dataKey="won_value"
            stroke="#047a5c"
            strokeWidth={2}
            fill="url(#revenue-fill)"
            dot={{ r: 3.5, fill: "#fff", stroke: "#047a5c", strokeWidth: 1.5 }}
            activeDot={{ r: 5, fill: "#047a5c" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** H3: deals won and lost per month, Sea Green and Coral. */
export function WonLostChart({ months }: { months: Dashboard["months"] }) {
  return (
    <div className="chart" role="img" aria-label={`Deals won and lost per month: ${months.map((m) => `${monthYear(m.month)} ${m.won_count} won, ${m.lost_count} lost`).join("; ")}`}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={months} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barGap={3}>
          <CartesianGrid vertical={false} stroke="#e3eaec" />
          <XAxis dataKey="month" tickFormatter={monthLabel} tick={axis} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={axis} axisLine={false} tickLine={false} width={40} />
          <Tooltip content={<CountTip />} cursor={{ fill: "rgba(7, 59, 76, 0.04)" }} />
          <Bar dataKey="won_count" fill="#06d6a0" radius={[3, 3, 0, 0]} maxBarSize={14} />
          <Bar dataKey="lost_count" fill="#f78c6b" radius={[3, 3, 0, 0]} maxBarSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
