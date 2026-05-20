/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Line,
} from 'recharts';
import type { DailyBreakdown } from '../../../types/behavior.types';

interface BehaviorChartsProps {
  data: DailyBreakdown[];
}

export default function BehaviorCharts({ data }: BehaviorChartsProps) {
  const [viewMode, setViewMode] = useState<'laboral' | 'extra'>('laboral');

  const formatDate = (dateStr: string) => {
    const parts = dateStr.split('-');
    return `${parts[2]}/${parts[1]}`;
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 2xl:gap-6 mt-4 2xl:mt-6">
      {/* Gráfica 1: Distribución del Tiempo */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 2xl:p-6 shadow-sm flex flex-col h-[300px] 2xl:h-[380px]">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 2xl:mb-6">
          <h3 className="text-[11px] 2xl:text-[13px] font-bold text-gray-700 uppercase tracking-wider">
            Distribución del Tiempo (Minutos)
          </h3>

          {/* Toggle Switch minimalista estilo Vercel */}
          <div className="bg-gray-100 p-1 rounded-lg flex items-center shadow-inner">
            <button
              onClick={() => setViewMode('laboral')}
              className={`px-3 py-1 text-[10px] 2xl:text-[11px] font-bold rounded-md transition-all ${
                viewMode === 'laboral'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Horario Laboral
            </button>
            <button
              onClick={() => setViewMode('extra')}
              className={`px-3 py-1 text-[10px] 2xl:text-[11px] font-bold rounded-md transition-all ${
                viewMode === 'extra'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Fuera de Horario
            </button>
          </div>
        </div>

        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="#f0f0f0"
            />
            <XAxis
              dataKey="fecha"
              tickFormatter={formatDate}
              tick={{ fontSize: 10 }}
              axisLine={{ stroke: '#e5e7eb' }}
            />
            <YAxis tick={{ fontSize: 10 }} axisLine={{ stroke: '#e5e7eb' }} />
            <Tooltip
              contentStyle={{
                fontSize: '12px',
                borderRadius: '8px',
                border: 'none',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
              }}
              formatter={(value: any, name: any) => {
                if (typeof value === 'number') {
                  const horas = Math.floor(value / 60);
                  const minutos = Math.round(value % 60);

                  const formatoTexto =
                    horas > 0 ? `${horas}h ${minutos}m` : `${minutos}m`;

                  return [`${value} min (${formatoTexto})`, name];
                }
                return [value, name];
              }}
            />
            <Legend
              iconType="circle"
              wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
            />
            <Bar
              dataKey={`tiempos.${viewMode}.clientes`}
              name="Clientes"
              stackId="a"
              fill="#16a34a"
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey={`tiempos.${viewMode}.traslados`}
              name="Traslados"
              stackId="a"
              fill="#f97316"
            />
            <Bar
              dataKey={`tiempos.${viewMode}.tools`}
              name="Tools Mx"
              stackId="a"
              fill="#2563eb"
            />
            <Bar
              dataKey={`tiempos.${viewMode}.casa`}
              name="Casa"
              stackId="a"
              fill="#9333ea"
            />
            <Bar
              dataKey={`tiempos.${viewMode}.noClientes`}
              name="Otros/No prod."
              stackId="a"
              fill="#dc2626"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Gráfica 2: Distancia vs. Visitas */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 2xl:p-6 shadow-sm flex flex-col h-[300px] 2xl:h-[380px]">
        <h3 className="text-[11px] 2xl:text-[13px] font-bold text-gray-700 mb-4 uppercase tracking-wider">
          Distancia vs. Visitas
        </h3>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="#f0f0f0"
            />
            <XAxis
              dataKey="fecha"
              tickFormatter={formatDate}
              tick={{ fontSize: 10 }}
              axisLine={{ stroke: '#e5e7eb' }}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 10 }}
              axisLine={{ stroke: '#e5e7eb' }}
              label={{
                value: 'km',
                angle: -90,
                position: 'insideLeft',
                fontSize: 10,
                fill: '#94a3b8',
              }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10 }}
              axisLine={{ stroke: '#e5e7eb' }}
              label={{
                value: 'visitas',
                angle: 90,
                position: 'insideRight',
                fontSize: 10,
                fill: '#2563eb',
              }}
            />
            <Tooltip
              contentStyle={{
                fontSize: '12px',
                borderRadius: '8px',
                border: 'none',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
              }}
            />
            <Legend
              iconType="circle"
              wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
            />
            <Bar
              yAxisId="left"
              dataKey="distanciaKm"
              name="Distancia (km)"
              fill="#94a3b8"
              radius={[4, 4, 0, 0]}
              barSize={20}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="clientesVisitadosCount"
              name="Clientes Visitados"
              stroke="#2563eb"
              strokeWidth={3}
              dot={{ r: 4, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }}
              activeDot={{ r: 6 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
