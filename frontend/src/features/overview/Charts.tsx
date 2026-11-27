import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Funnel, FunnelChart, LabelList, Tooltip, XAxis, YAxis } from 'recharts'
import { STAGE_COLOR, STAGE_FILL } from '../../components/StageBadge'
import { money, moneyAxis } from '../../format'
import type { Dashboard, MonthFigures } from './api'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const AXIS_TICK = { fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fill: '#073B4C' }
const GRID = '#E3EAEC'

function monthName(m: MonthFigures) {
  return `${MONTH_NAMES[Number(m.month.slice(5, 7)) - 1]} ${m.year}`
}

type TipProps = { active?: boolean; payload?: { payload: MonthFigures }[]; show: (m: MonthFigures) => string }

/** D17: a tooltip with the exact value and the month. */
function MonthTooltip({ active, payload, show }: TipProps) {
  if (!active || !payload?.length) return null
  const m = payload[0].payload
  return (
    <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--midnight)', color: '#fff' }}>
      <div style={{ fontSize: 11, color: 'var(--sea-mist)' }}>{monthName(m)}</div>
      <div className="mono" style={{ fontSize: 14, fontWeight: 600 }}>
        {show(m)}
      </div>
    </div>
  )
}

/** R46: revenue won per month, last 12 months, Sea Green line with a soft fill. */
export function RevenueChart({ monthly }: { monthly: MonthFigures[] }) {
  return (
    <AreaChart
      responsive
      style={{ width: '100%', height: 270 }}
      data={monthly}
      margin={{ top: 12, right: 12, bottom: 0, left: 4 }}
      accessibilityLayer
      title="Revenue won per month, last 12 months"
    >
      <defs>
        <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#06D6A0" stopOpacity={0.28} />
          <stop offset="1" stopColor="#06D6A0" stopOpacity={0} />
        </linearGradient>
      </defs>
      <CartesianGrid vertical={false} stroke={GRID} />
      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} interval={0} />
      <YAxis tickFormatter={moneyAxis} tickLine={false} axisLine={false} tick={AXIS_TICK} width={52} />
      <Tooltip
        content={<MonthTooltip show={(m) => money(m.revenue_cents)} />}
        cursor={{ stroke: '#073B4C', strokeOpacity: 0.25, strokeDasharray: '3 3' }}
      />
      <Area
        type="monotone"
        dataKey="revenue_cents"
        name="Revenue won"
        stroke="#04A57B"
        strokeWidth={2.5}
        fill="url(#revenueFill)"
        dot={{ r: 3, fill: '#fff', stroke: '#04A57B', strokeWidth: 2 }}
        activeDot={{ r: 5, fill: '#fff', stroke: '#04A57B', strokeWidth: 2 }}
        isAnimationActive={false}
      />
    </AreaChart>
  )
}

/** R47: the number of deals won per month, Marigold bars, this month a shade darker. */
export function DealsWonChart({ monthly }: { monthly: MonthFigures[] }) {
  return (
    <BarChart
      responsive
      style={{ width: '100%', height: 240 }}
      data={monthly}
      margin={{ top: 20, right: 4, bottom: 0, left: -12 }}
      accessibilityLayer
      title="Deals won per month, last 12 months"
    >
      <CartesianGrid vertical={false} stroke={GRID} />
      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ ...AXIS_TICK, fontSize: 10 }} interval={0} />
      <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={AXIS_TICK} width={40} />
      <Tooltip
        content={<MonthTooltip show={(m) => (m.won_count === 1 ? '1 deal won' : `${m.won_count} deals won`)} />}
        cursor={{ fill: 'rgba(7, 59, 76, 0.05)' }}
      />
      <Bar dataKey="won_count" name="Deals won" radius={[4, 4, 0, 0]} isAnimationActive={false}>
        {monthly.map((m, i) => (
          <Cell key={m.month} fill={i === monthly.length - 1 ? '#E9A21F' : '#FFC145'} />
        ))}
        <LabelList dataKey="won_count" position="top" style={{ ...AXIS_TICK, fontWeight: 600 }} />
      </Bar>
    </BarChart>
  )
}

type LabelProps = { x?: number | string; y?: number | string; width?: number | string; height?: number | string; index?: number }

/** R48: one trapezoid per stage, labelled with stage, value and deal count. */
export function FunnelGraph({ funnel }: { funnel: Dashboard['funnel'] }) {
  // Width follows value, plus a fixed share of the widest, so the narrowest stages still fit their labels.
  const widest = Math.max(...funnel.map((f) => f.value_cents), 1)
  const data = funnel.map((f) => ({
    ...f,
    width: f.value_cents + widest * 0.6,
    fill: f.stage === 'Negotiation' ? STAGE_FILL.Negotiation.background : STAGE_COLOR[f.stage],
  }))
  const renderLabel = ({ x = 0, y = 0, width = 0, height = 0, index = 0 }: LabelProps) => {
    const f = funnel[index]
    if (!f) return null
    return (
      <text
        x={Number(x) + Number(width) / 2}
        y={Number(y) + Number(height) / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill={STAGE_FILL[f.stage].color}
        style={{ fontSize: 12, fontWeight: 600 }}
      >
        <tspan style={{ fontFamily: 'Instrument Sans, sans-serif' }}>{f.stage}</tspan>
        <tspan dx={10} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          {money(f.value_cents)}
        </tspan>
        <tspan dx={10} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          {f.count === 1 ? '1 deal' : `${f.count} deals`}
        </tspan>
      </text>
    )
  }
  return (
    <FunnelChart responsive style={{ width: '100%', height: 300 }} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} title="Sales funnel">
      <Funnel dataKey="width" nameKey="stage" data={data} lastShapeType="rectangle" isAnimationActive={false}>
        <LabelList dataKey="stage" content={renderLabel} />
      </Funnel>
    </FunnelChart>
  )
}
