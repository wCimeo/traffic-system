import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { motion } from 'motion/react';
import {
  Activity,
  CalendarDays,
  Gauge,
  MapPin,
  RefreshCcw,
  TrendingUp,
  Wind,
  Zap,
} from 'lucide-react';
import api, { fetchDashboardChart, triggerPrediction } from '../api';
import { useToast } from '../components/ToastProvider';

const NODE_OPTIONS = ['A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7', 'H8', 'I9', 'J10', 'K11'];

const PEAK_WINDOWS = [
  { label: '早高峰', start: 7 * 60, end: 9 * 60, color: '#f59e0b' },
  { label: '午高峰', start: 12 * 60, end: 14 * 60, color: '#0ea5e9' },
  { label: '晚高峰', start: 17 * 60, end: 19 * 60, color: '#ef4444' },
];

const FULL_DAY_STEP_MINUTES = 5;

type TrafficRow = {
  node_id: string;
  speed: number;
  congestion_status: number;
  collected_at: string;
};

type ActualSeriesItem = {
  timestamp: string;
  speed: number;
  congestion_status: number;
};

type PredictionSeriesItem = {
  generated_at: string;
  target_at: string | null;
  predicted_speed: number;
  horizon_minutes: number;
  lead_minutes: number;
  is_leading_actual: boolean;
};

type ChartPoint = {
  minute: number;
  time: string;
  actualSpeed?: number;
  predictedSpeed?: number;
  actualStatus?: number;
  generatedAt?: string;
};

type ZoomRange = {
  startIndex: number;
  endIndex: number;
};

type PeakWindow = {
  label: string;
  start: number;
  end: number;
  color: string;
};

const toDateInputValue = (date = new Date()) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const minuteOfDay = (timestamp: string) => {
  const date = new Date(timestamp);
  return date.getHours() * 60 + date.getMinutes();
};

const minuteToLabel = (minute: number) => {
  const hour = Math.floor(minute / 60);
  const min = minute % 60;
  return `${`${hour}`.padStart(2, '0')}:${`${min}`.padStart(2, '0')}`;
};

const statusText = (status?: number) => {
  if (status === 1) return '畅通';
  if (status === 2) return '缓行';
  if (status === 3) return '拥堵';
  if (status === 4) return '严重拥堵';
  return '未知';
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '--';
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatPercent = (value?: number | null) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
  return `${value.toFixed(1)}%`;
};

const buildChartPoints = (actual: ActualSeriesItem[], predicted: PredictionSeriesItem[]) => {
  const bucket = new Map<number, ChartPoint>();

  for (let minute = 0; minute <= 24 * 60; minute += FULL_DAY_STEP_MINUTES) {
    bucket.set(minute, {
      minute,
      time: minuteToLabel(minute),
    });
  }

  actual.forEach((item) => {
    const minute = minuteOfDay(item.timestamp);
    bucket.set(minute, {
      ...bucket.get(minute),
      minute,
      time: minuteToLabel(minute),
      actualSpeed: Number(item.speed.toFixed(2)),
      actualStatus: item.congestion_status,
    });
  });

  predicted.forEach((item) => {
    if (!item.target_at) return;
    const minute = minuteOfDay(item.target_at);
    bucket.set(minute, {
      ...bucket.get(minute),
      minute,
      time: minuteToLabel(minute),
      predictedSpeed: Number(item.predicted_speed.toFixed(2)),
      generatedAt: item.generated_at,
    });
  });

  if (!bucket.has(24 * 60)) {
    bucket.set(24 * 60, {
      minute: 24 * 60,
      time: minuteToLabel(24 * 60),
    });
  }

  return Array.from(bucket.values()).sort((a, b) => a.minute - b.minute);
};

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as ChartPoint;
  const actual = payload.find((item: any) => item.dataKey === 'actualSpeed' && item.value !== undefined);
  const predicted = payload.find((item: any) => item.dataKey === 'predictedSpeed' && item.value !== undefined);

  return (
    <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-xl shadow-slate-900/10">
      <div className="mb-2 text-xs font-black text-slate-900">{minuteToLabel(Number(label))}</div>
      {actual && (
        <div className="text-xs font-bold text-emerald-600">
          真实采集：{actual.value} km/h · {statusText(point.actualStatus)}
        </div>
      )}
      {predicted && (
        <div className="mt-1 text-xs font-bold text-sky-600">
          15分钟预测：{predicted.value} km/h
        </div>
      )}
      {predicted && (
        <div className="mt-1 text-[11px] font-semibold text-slate-400">
          生成时间：{formatDateTime(point.generatedAt)}
        </div>
      )}
    </div>
  );
};

export default function Dashboard() {
  const { showToast } = useToast();
  const [latest, setLatest] = useState<TrafficRow[]>([]);
  const [selectedNode, setSelectedNode] = useState('A1');
  const [selectedDate, setSelectedDate] = useState(toDateInputValue());
  const [chartPoints, setChartPoints] = useState<ChartPoint[]>([]);
  const [chartMeta, setChartMeta] = useState({ actualCount: 0, predictedCount: 0, sourceTable: '--' });
  const [zoomRange, setZoomRange] = useState<ZoomRange>({ startIndex: 0, endIndex: 0 });
  const [chartLoading, setChartLoading] = useState(false);
  const [predicting, setPredicting] = useState(false);
  const [pendingIncidents, setPendingIncidents] = useState(0);

  const loadLatest = useCallback(async () => {
    try {
      const res = await api.get('/api/traffic/latest');
      setLatest(res.data.data || []);
    } catch {
      setLatest([]);
    }
  }, []);

  const loadDashboardChart = useCallback(async () => {
    setChartLoading(true);
    try {
      const res = await fetchDashboardChart(selectedNode, selectedDate, 15);
      const data = res.data.data;
      const points = buildChartPoints(data.actual_series || [], data.predicted_series || []);
      setChartPoints(points);
      setZoomRange({ startIndex: 0, endIndex: Math.max(points.length - 1, 0) });
      setChartMeta({
        actualCount: data.actual_series?.length || 0,
        predictedCount: data.predicted_series?.length || 0,
        sourceTable: res.data.meta?.source_table || '--',
      });
    } catch (err) {
      console.error(err);
      setChartPoints([]);
      setZoomRange({ startIndex: 0, endIndex: 0 });
      setChartMeta({ actualCount: 0, predictedCount: 0, sourceTable: '--' });
      showToast('Dashboard 图表数据加载失败，请检查后端服务和数据源配置', 'error');
    } finally {
      setChartLoading(false);
    }
  }, [selectedDate, selectedNode, showToast]);

  const triggerPredict = async () => {
    setPredicting(true);
    try {
      await triggerPrediction();
      await loadDashboardChart();
      showToast('15/30/45/60 分钟预测已刷新', 'success');
    } catch (e) {
      console.error(e);
      showToast('预测触发失败，请确认 AI 服务与后端都已启动', 'error');
    } finally {
      setPredicting(false);
    }
  };

  const loadPendingIncidents = useCallback(async () => {
    try {
      const res = await api.get('/api/incidents');
      const incidents = res.data.data || [];
      setPendingIncidents(incidents.filter((i: any) => i.status === 'reported').length);
    } catch {
      setPendingIncidents(0);
    }
  }, []);

  useEffect(() => {
    loadLatest();
    loadPendingIncidents();
    const timer = window.setInterval(loadLatest, 60000);
    return () => window.clearInterval(timer);
  }, [loadLatest, loadPendingIncidents]);

  useEffect(() => {
    loadDashboardChart();
  }, [loadDashboardChart]);

  const avgSpeed = latest.length
    ? (latest.reduce((sum, row) => sum + Number(row.speed), 0) / latest.length).toFixed(1)
    : '--';
  const congested = latest.filter((row) => row.congestion_status >= 2).length;
  const selectedLatest = latest.find((row) => row.node_id === selectedNode);
  const visibleChartPoints = useMemo(() => {
    if (!chartPoints.length) return [];
    const startIndex = Math.max(0, Math.min(zoomRange.startIndex, chartPoints.length - 1));
    const endIndex = Math.max(startIndex, Math.min(zoomRange.endIndex, chartPoints.length - 1));
    return chartPoints.slice(startIndex, endIndex + 1);
  }, [chartPoints, zoomRange]);

  const xDomain = useMemo<[number, number]>(() => {
    if (visibleChartPoints.length < 2) return [0, 1440];
    const first = visibleChartPoints[0].minute;
    const last = visibleChartPoints[visibleChartPoints.length - 1].minute;
    return [Math.max(0, first - 5), Math.min(1440, last + 5)];
  }, [visibleChartPoints]);

  const yDomain = useMemo<[number, number]>(() => {
    const values = visibleChartPoints.flatMap((point) =>
      [point.actualSpeed, point.predictedSpeed].filter((value): value is number => typeof value === 'number')
    );
    if (!values.length) return [0, 70];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = Math.max(3, (max - min) * 0.18);
    return [Math.max(0, Math.floor(min - padding)), Math.min(80, Math.ceil(max + padding))];
  }, [visibleChartPoints]);

  const chartTicks = useMemo(() => {
    const [start, end] = xDomain;
    const span = Math.max(1, end - start);
    const step = span <= 120 ? 15 : span <= 360 ? 30 : span <= 720 ? 60 : 120;
    const firstTick = Math.ceil(start / step) * step;
    const ticks: number[] = [];
    for (let minute = firstTick; minute <= end; minute += step) {
      ticks.push(minute);
    }
    return ticks.length ? ticks : [start, end];
  }, [xDomain]);

  const visiblePeakWindows = useMemo<PeakWindow[]>(() => {
    const [start, end] = xDomain;
    return PEAK_WINDOWS
      .map((peak) => ({
        ...peak,
        start: Math.max(start, peak.start),
        end: Math.min(end, peak.end),
      }))
      .filter((peak) => peak.start < peak.end);
  }, [xDomain]);

  const latestActualPoint = useMemo(
    () => [...chartPoints].reverse().find((point) => typeof point.actualSpeed === 'number'),
    [chartPoints]
  );

  const latestPredictedPoint = useMemo(
    () => [...chartPoints].reverse().find((point) => typeof point.predictedSpeed === 'number'),
    [chartPoints]
  );

  const predictionAccuracy = useMemo(() => {
    const comparable = chartPoints.filter(
      (point): point is ChartPoint & { actualSpeed: number; predictedSpeed: number } =>
        typeof point.actualSpeed === 'number' && typeof point.predictedSpeed === 'number'
    );
    if (!comparable.length) return { accuracy: null, mae: null, sampleCount: 0 };

    const mae =
      comparable.reduce((sum, point) => sum + Math.abs(point.actualSpeed - point.predictedSpeed), 0) / comparable.length;
    const meanRelativeError =
      comparable.reduce((sum, point) => sum + Math.abs(point.actualSpeed - point.predictedSpeed) / Math.max(point.actualSpeed, 1), 0) /
      comparable.length;

    return {
      accuracy: Math.max(0, 100 - meanRelativeError * 100),
      mae,
      sampleCount: comparable.length,
    };
  }, [chartPoints]);

  const focusRange = useCallback((startMinute: number, endMinute: number) => {
    if (!chartPoints.length) return;
    const startIndex = Math.max(
      0,
      chartPoints.findIndex((point) => point.minute >= Math.max(0, startMinute - FULL_DAY_STEP_MINUTES))
    );
    const rawEndIndex = chartPoints.findIndex((point) => point.minute >= Math.min(1440, endMinute + FULL_DAY_STEP_MINUTES));
    const endIndex = rawEndIndex === -1 ? chartPoints.length - 1 : rawEndIndex;
    setZoomRange({ startIndex, endIndex: Math.max(startIndex, endIndex) });
  }, [chartPoints]);

  const restoreFullDay = useCallback(() => {
    if (!chartPoints.length) return;
    setZoomRange({ startIndex: 0, endIndex: chartPoints.length - 1 });
  }, [chartPoints]);

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.08 } },
  };

  const item = {
    hidden: { opacity: 0, y: 18 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <div className="space-y-10 pb-10">
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4"
      >
        {[
          { label: '监测节点总数', value: `${latest.length}`, unit: '个', icon: MapPin, color: 'text-slate-900' },
          { label: '区域平均车速', value: avgSpeed, unit: 'km/h', icon: Wind, color: 'text-brand-600' },
          { label: '拥堵路口预警', value: `${congested}`, unit: '处', icon: Activity, color: 'text-red-600' },
          { label: '待受理事件数', value: `${pendingIncidents}`, unit: '件', icon: Zap, color: 'text-amber-500' },
        ].map((card) => (
          <motion.div key={card.label} variants={item} className="metric-card group relative overflow-hidden">
            <div className="relative z-10">
              <div className="mb-6 flex items-center justify-between">
                <span className="text-[12px] font-black uppercase tracking-widest text-slate-600 transition-colors group-hover:text-slate-500">
                  {card.label}
                </span>
                <card.icon className={`h-5 w-5 ${card.color} opacity-20 transition-all duration-500 group-hover:opacity-100`} />
              </div>
              <div className="flex items-baseline gap-2">
                <span className={`data-mono text-4xl font-black tracking-tight ${card.color}`}>{card.value}</span>
                <span className="text-[10px] font-bold uppercase tracking-tighter text-slate-300">{card.unit}</span>
              </div>
            </div>
            <div className="absolute -bottom-6 -right-6 z-0 h-24 w-24 rounded-full bg-slate-50 opacity-50 transition-transform duration-700 group-hover:scale-150" />
          </motion.div>
        ))}
      </motion.div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Daily Traffic Outlook</span>
          </div>
          <h2 className="text-2xl font-black tracking-tight text-slate-900">日内交通速度与 15 分钟预测</h2>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-slate-500">
            按日期查看 00:00-24:00 的真实采集曲线与预测曲线。拖动图表底部缩放条，可以聚焦到任意时段。
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/70 bg-white p-3 shadow-soft sm:flex-row sm:items-center">
          <label className="flex h-11 items-center gap-2 rounded-xl bg-slate-50 px-3 text-sm font-bold text-slate-700">
            <MapPin className="h-4 w-4 text-brand-500" />
            <select
              className="h-full bg-transparent pr-6 text-sm font-bold outline-none"
              value={selectedNode}
              onChange={(e) => setSelectedNode(e.target.value)}
            >
              {NODE_OPTIONS.map((node) => (
                <option key={node} value={node}>
                  路口 {node}
                </option>
              ))}
            </select>
          </label>

          <label className="flex h-11 items-center gap-2 rounded-xl bg-slate-50 px-3 text-sm font-bold text-slate-700">
            <CalendarDays className="h-4 w-4 text-brand-500" />
            <input
              type="date"
              className="h-full bg-transparent text-sm font-bold outline-none"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </label>

          <button onClick={triggerPredict} disabled={predicting} className="btn-primary h-11 min-w-[150px] gap-2">
            <RefreshCcw className={`h-4 w-4 ${predicting ? 'animate-spin' : ''}`} />
            <span>{predicting ? '预测中' : '刷新预测'}</span>
          </button>
        </div>
      </div>

      <div className="console-card flex min-w-0 flex-col">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">00:00-24:00 速度曲线</h3>
            <p className="mt-1 text-xs font-bold text-slate-400">
              {selectedDate} · {selectedNode} · 数据源 {chartMeta.sourceTable}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs font-black">
            <span className="inline-flex items-center gap-2 text-emerald-600">
              <span className="h-1 w-8 rounded-full bg-emerald-500" />
              真实采集曲线
            </span>
            <span className="inline-flex items-center gap-2 text-sky-600">
              <span className="h-1 w-8 rounded-full border-t-2 border-dashed border-sky-500" />
              15 分钟预测
            </span>
          </div>
        </div>

        <div className="grid min-h-[620px] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_220px]">
          <div className="min-h-0 p-5 xl:border-r xl:border-slate-100">
            <ResponsiveContainer width="100%" height="100%" minHeight={380}>
              <ComposedChart data={chartPoints} margin={{ top: 18, right: 28, bottom: 28, left: 0 }}>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#eef2f7" />
                {visiblePeakWindows.map((peak) => (
                  <ReferenceArea
                    key={peak.label}
                    x1={peak.start}
                    x2={peak.end}
                    y1={yDomain[0]}
                    y2={yDomain[1]}
                    fill={peak.color}
                    fillOpacity={0.09}
                    strokeOpacity={0}
                    ifOverflow="hidden"
                    label={{
                      value: peak.label,
                      fill: peak.color,
                      fontSize: 11,
                      fontWeight: 800,
                      position: 'top',
                    }}
                  />
                ))}
                <XAxis
                  dataKey="minute"
                  type="number"
                  domain={xDomain}
                  ticks={chartTicks}
                  tickFormatter={minuteToLabel}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                />
                <YAxis
                  domain={yDomain}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                  unit=" km/h"
                />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  name="真实采集曲线"
                  type="natural"
                  dataKey="actualSpeed"
                  stroke="#10b981"
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0, fill: '#10b981' }}
                  connectNulls
                  isAnimationActive={false}
                />
                <Line
                  name="15分钟预测"
                  type="natural"
                  dataKey="predictedSpeed"
                  stroke="#0284c7"
                  strokeWidth={3}
                  strokeDasharray="8 6"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0, fill: '#0284c7' }}
                  connectNulls
                  isAnimationActive={false}
                />
                <Brush
                  dataKey="time"
                  startIndex={zoomRange.startIndex}
                  endIndex={zoomRange.endIndex}
                  onChange={(range) => {
                    if (typeof range?.startIndex !== 'number' || typeof range?.endIndex !== 'number') return;
                    setZoomRange({ startIndex: range.startIndex, endIndex: range.endIndex });
                  }}
                  height={34}
                  travellerWidth={12}
                  stroke="#0f766e"
                  fill="#f8fafc"
                  tickFormatter={(value) => String(value)}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="border-t border-slate-100 p-4 xl:border-t-0">
            <div className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">Peak Focus</div>
            <div className="space-y-2">
              <button
                type="button"
                onClick={restoreFullDay}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left text-sm font-black text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
              >
                全天
              </button>
              {PEAK_WINDOWS.map((peak) => (
                <button
                  key={peak.label}
                  type="button"
                  onClick={() => focusRange(peak.start, peak.end)}
                  className="w-full rounded-xl border px-3 py-3 text-left text-sm font-black text-slate-700 transition hover:brightness-95"
                  style={{ backgroundColor: `${peak.color}12`, borderColor: `${peak.color}44` }}
                >
                  <div style={{ color: peak.color }}>{peak.label}</div>
                  <div className="mt-1 text-[11px] font-bold text-slate-500">
                    {minuteToLabel(peak.start)}-{minuteToLabel(peak.end)}
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs font-semibold leading-relaxed text-slate-500">
              点击后会把图表快速聚焦到对应高峰时段。
            </div>
          </div>
        </div>

        {!chartLoading && chartMeta.actualCount + chartMeta.predictedCount === 0 && (
          <div className="px-6 pb-6 text-sm font-bold text-slate-400">
            当前日期没有可展示的真实采集或预测记录。请确认数据源已采集，并执行一次预测刷新。
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="console-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400">Selected Node</div>
            <Gauge className="h-4 w-4 text-brand-500" />
          </div>
          <div className="text-3xl font-black text-slate-900">{selectedNode}</div>
          <div className="mt-3 text-sm font-bold text-slate-500">
            最新速度：{selectedLatest ? `${Number(selectedLatest.speed).toFixed(1)} km/h` : '--'}
          </div>
          <div className="mt-1 text-sm font-bold text-slate-500">
            最新状态：{statusText(selectedLatest?.congestion_status)}
          </div>
          <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-3">
            <div className="text-[11px] font-black uppercase tracking-widest text-emerald-700">Actual Snapshot</div>
            <div className="mt-2 text-2xl font-black text-emerald-700">
              {latestActualPoint?.actualSpeed !== undefined ? `${latestActualPoint.actualSpeed.toFixed(1)} km/h` : '--'}
            </div>
            <div className="mt-1 text-xs font-bold text-emerald-700/80">
              采集时间：{latestActualPoint ? latestActualPoint.time : '--'}
            </div>
          </div>
        </div>

        <div className="console-card p-5">
          <div className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400">
            <TrendingUp className="h-4 w-4 text-brand-500" />
            Prediction Snapshot
          </div>
          <div className="rounded-xl bg-sky-50 px-4 py-4">
            <div className="text-[11px] font-black uppercase tracking-widest text-sky-700">Forecast</div>
            <div className="mt-2 text-2xl font-black text-sky-700">
              {latestPredictedPoint?.predictedSpeed !== undefined ? `${latestPredictedPoint.predictedSpeed.toFixed(1)} km/h` : '--'}
            </div>
            <div className="mt-2 space-y-1 text-xs font-bold text-sky-700/80">
              <div>预测时点：{latestPredictedPoint ? latestPredictedPoint.time : '--'}</div>
              <div>生成时间：{formatDateTime(latestPredictedPoint?.generatedAt)}</div>
            </div>
          </div>
          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs font-semibold leading-relaxed text-slate-500">
            这里展示当前图表中最新一条 15 分钟预测值，方便直接和真实速度做对照。
          </div>
        </div>

        <div className="console-card p-5">
          <div className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400">
            <Activity className="h-4 w-4 text-brand-500" />
            Prediction Accuracy
          </div>
          <div className="text-3xl font-black text-slate-900">{formatPercent(predictionAccuracy.accuracy)}</div>
          <div className="mt-2 text-sm font-bold text-slate-500">
            平均绝对误差：{typeof predictionAccuracy.mae === 'number' ? `${predictionAccuracy.mae.toFixed(1)} km/h` : '--'}
          </div>
          <div className="mt-1 text-sm font-bold text-slate-500">
            对比样本：{predictionAccuracy.sampleCount}
          </div>
          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs font-semibold leading-relaxed text-slate-500">
            准确度按图内同一时刻同时存在真实值和预测值的点位估算，用于快速判断模型表现趋势。
          </div>
        </div>

        <div className="console-card p-5">
          <div className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400">
            <Zap className="h-4 w-4 text-brand-500" />
            Data Summary
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm font-bold">
              <span className="text-slate-500">真实采集记录</span>
              <span className="text-emerald-600">{chartMeta.actualCount}</span>
            </div>
            <div className="flex items-center justify-between text-sm font-bold">
              <span className="text-slate-500">15分钟预测记录</span>
              <span className="text-sky-600">{chartMeta.predictedCount}</span>
            </div>
            <div className="flex items-center justify-between text-sm font-bold">
              <span className="text-slate-500">可视时间范围</span>
              <span className="text-slate-700">{minuteToLabel(xDomain[0])}-{minuteToLabel(xDomain[1])}</span>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-xs font-semibold leading-relaxed text-slate-500">
              数据源：{chartMeta.sourceTable}。拖动图表底部缩放条后，这里的可视时间范围也会同步变化。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
