'use client'
import React from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, CartesianGrid, Legend,
  AreaChart, Area
} from 'recharts'

function fmt(n: number) {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

interface CardProps { title: string; children: React.ReactNode; height?: number }
function Card({ title, children, height }: CardProps) {
  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: '1.25rem 1.5rem',
      border: '1px solid #e8edf2', boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#0f1e2b', marginBottom: '1rem' }}>{title}</div>
      <div style={{ height: height ?? 200 }}>{children}</div>
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#fff', border: '1px solid #e8edf2', borderRadius: 10, padding: '0.6rem 0.9rem', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
      <div style={{ fontWeight: 600, marginBottom: 4, color: '#0f1e2b' }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color ?? '#64748b' }}>{p.name}: {typeof p.value === 'number' && p.value > 1000 ? fmt(p.value) : p.value}</div>
      ))}
    </div>
  )
}



export function BIChartsOverview({
  porSemana,
  porEstado,
  porMes,
  isMobile
}: {
  porSemana: { semana: string; citas: number }[]
  porEstado: { name: string; value: number; color: string }[]
  porMes: { mes: string; ingresos: number }[]
  isMobile: boolean
}) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14, marginBottom: '1.25rem' }}>
        <Card title="Citas por semana">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={porSemana} barSize={20}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="semana" tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="citas" name="Citas" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Estado de citas">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={porEstado} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={72} innerRadius={36}
                label={({ name, percent }: any) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                labelLine={false}>
                {porEstado.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card title="Ingresos mensuales" height={220}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={porMes}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => '$' + (v / 1000).toFixed(0) + 'k'} />
            <Tooltip content={<CustomTooltip />} />
            <Line type="monotone" dataKey="ingresos" name="Ingresos" stroke="#6366f1" strokeWidth={2} dot={{ r: 4, fill: '#6366f1' }} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </>
  )
}

export function BIChartsAgenda({
  porDiaSemana,
  porHora,
  isMobile
}: {
  porDiaSemana: { dia: string; ocupacion: number }[]
  porHora: { hora: string; ocupacion: number }[]
  isMobile: boolean
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
      <Card title="Ocupación por día de la semana (%)">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={porDiaSemana} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="dia" tick={{ fontSize: 11, fill: '#94a3b8' }} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => v + '%'} domain={[0, 100]} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="ocupacion" name="Ocupación" radius={[6, 6, 0, 0]}>
              {porDiaSemana.map((d, i) => <Cell key={i} fill={d.ocupacion >= 70 ? '#10b981' : d.ocupacion >= 40 ? '#f59e0b' : '#ef4444'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Ocupación por hora del día (%)">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={porHora} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="hora" tick={{ fontSize: 9, fill: '#94a3b8' }} interval={0} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => v + '%'} domain={[0, 100]} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="ocupacion" name="Ocupación" fill="#6366f1" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  )
}

export function BIChartsTratamientos({
  porTratamiento,
  isMobile
}: {
  porTratamiento: { name: string; citas: number; ingresos: number }[]
  isMobile: boolean
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14, marginBottom: '1.25rem' }}>
      <Card title="Citas por tratamiento" height={260}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={porTratamiento} layout="vertical" barSize={14}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} width={isMobile ? 80 : 110} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="citas" name="Citas" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Ingresos por tratamiento" height={260}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={porTratamiento} layout="vertical" barSize={14}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => '$' + (v / 1000).toFixed(0) + 'k'} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} width={isMobile ? 80 : 110} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="ingresos" name="Ingresos" fill="#10b981" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  )
}

export function BIChartsFinanciero({
  porMes,
  proyeccionSemanas,
  isMobile
}: {
  porMes: { mes: string; ingresos: number; citas: number }[]
  proyeccionSemanas: { name: string; Agendado: number; Proyectado: number }[]
  isMobile: boolean
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
      <Card title="Ingresos vs Citas por mes" height={260}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={porMes}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => '$' + (v / 1000).toFixed(0) + 'k'} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="left" dataKey="ingresos" name="Ingresos" fill="#6366f1" radius={[4, 4, 0, 0]} />
            <Bar yAxisId="right" dataKey="citas" name="Citas" fill="#e0e7ff" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Proyección de Cashflow (Próximas 4 semanas)" height={260}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={proyeccionSemanas}>
            <defs>
              <linearGradient id="colorProyectado" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorAgendado" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => '$' + (v / 1000).toFixed(0) + 'k'} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="Proyectado" name="Proyectado (Est. Histórico)" stroke="#10b981" fillOpacity={1} fill="url(#colorProyectado)" />
            <Area type="monotone" dataKey="Agendado" name="Agendado (Turnos)" stroke="#6366f1" fillOpacity={1} fill="url(#colorAgendado)" />
          </AreaChart>
        </ResponsiveContainer>
      </Card>
    </div>
  )
}
