import { useEffect, useRef, useState } from 'react';
import api from '../api';

declare global {
  interface Window {
    AMap: any;
    _AMapSecurityConfig: any;
  }
}

const NODE_META = [
    {"id": "A1",  "name": "天府大道-锦城大道路口",      "lng": 104.069093, "lat": 30.575761},
    {"id": "B2",  "name": "益州大道-锦城大道路口",      "lng": 104.059806, "lat": 30.574761},
    {"id": "C3",  "name": "成华大道-杉板桥路口",        "lng": 104.136395, "lat": 30.673074},
    {"id": "D4",  "name": "天府大道-华阳立交路口",      "lng": 104.067643, "lat": 30.598064},
    {"id": "E5",  "name": "剑南大道-锦城大道路口",      "lng": 104.047516, "lat": 30.575108},
    {"id": "F6",  "name": "益州大道-府城大道路口",      "lng": 104.060269, "lat": 30.589527},
    {"id": "G7",  "name": "天府三街-天府大道路口",      "lng": 104.069204, "lat": 30.546203},
    {"id": "H8",  "name": "科华南路-锦尚西二路路口",    "lng": 104.0785, "lat": 30.5892},
    {"id": "I9",  "name": "中环路火车南站-科华南路口",  "lng": 104.077952, "lat": 30.608579},
    {"id": "J10", "name": "东站西广场-邛崃山路路口",    "lng": 104.1356, "lat": 30.6298},
];

const STATUS_COLOR: Record<number, string> = {
  0: '#9ca3af',
  1: '#10b981',
  2: '#f59e0b',
  3: '#ef4444',
  4: '#7f1d1d',
};

const STATUS_LABEL: Record<number, string> = {
  0: '暂无数据',
  1: '畅通',
  2: '缓行',
  3: '拥堵',
  4: '严重拥堵',
};

export default function MapView() {
  const mapRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<any[]>([]);
  const [latest, setLatest] = useState<any[]>([]);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [lastUpdate, setLastUpdate] = useState('');

  const loadLatest = async () => {
    const res = await api.get('/api/traffic/latest');
    const data = res.data.data || [];
    setLatest(data);
    setLastUpdate(new Date().toLocaleTimeString('zh'));
    return data;
  };

  const updateMarkers = (data: any[]) => {
    if (!mapRef.current) return;
    const statusMap: Record<string, any> = {};
    data.forEach((r) => { statusMap[r.node_id] = r; });

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    NODE_META.forEach((node) => {
      const record = statusMap[node.id];
      const status = record?.congestion_status ?? 0;
      const color = STATUS_COLOR[status];

      const marker = new window.AMap.CircleMarker({
        center: [node.lng, node.lat],
        radius: 12,
        fillColor: color,
        fillOpacity: 0.9,
        strokeColor: '#fff',
        strokeWeight: 2,
        cursor: 'pointer',
        extData: { node, record },
      });

      const label = new window.AMap.Text({
        text: node.id,
        position: [node.lng, node.lat],
        offset: new window.AMap.Pixel(-10, -8),
        style: {
          'font-size': '11px',
          'font-weight': 'bold',
          color: '#fff',
          'background-color': 'transparent',
          border: 'none',
          padding: '0',
        },
      });

      marker.on('click', () => {
        setSelectedNode({ node, record });
      });

      marker.setMap(mapRef.current);
      label.setMap(mapRef.current);
      markersRef.current.push(marker, label);
    });
  };

  useEffect(() => {
    const init = async () => {
      const data = await loadLatest();
      const map = new window.AMap.Map(containerRef.current, {
        zoom: 12,
        center: [104.0695, 30.5600],
        mapStyle: 'amap://styles/light',
      });
      mapRef.current = map;
      updateMarkers(data);
    };

    if (window.AMap) {
      init();
    } else {
      const timer = setInterval(() => {
        if (window.AMap) { clearInterval(timer); init(); }
      }, 300);
    }

    return () => {
      markersRef.current.forEach((m) => m.remove?.());
      mapRef.current?.destroy?.();
    };
  }, []);

  const handleRefresh = async () => {
    const data = await loadLatest();
    updateMarkers(data);
  };

  return (
    <div className="console-page">
      <div className="page-head">
        <div>
          <h2 className="console-title">实时路网地图</h2>
          <p className="console-subtitle">
            地图会读取最新路况数据，并用颜色标记当前拥堵状态。
          </p>
        </div>
        <button
          onClick={handleRefresh}
          className="primary-btn"
        >
          刷新地图
        </button>
      </div>

      <div className="map-shell">
      {/* 地图主体 */}
      <div className="map-main">
        <div className="cards-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <div className="metric-card">
            <div className="metric-label">当前区域</div>
            <div className="text-sm font-semibold text-slate-800">中国四川成都</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">当前点位数</div>
            <div className="text-sm font-semibold text-slate-800">{NODE_META.length} 个</div>
          </div>
        </div>

        {/* 图例 */}
        <div className="mb-4 flex flex-wrap items-center gap-5">
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-full"
                style={{ background: STATUS_COLOR[Number(k)] }} />
              <span className="text-xs font-medium text-slate-500">{v}</span>
            </div>
          ))}
        </div>

        {/* 地图容器 */}
        <div ref={containerRef} className="map-container" />
      </div>

      {/* 右侧面板 */}
      <div className="map-side">
        <div className="mb-4 text-sm font-medium text-slate-500">地图操作</div>
        <button
          onClick={handleRefresh}
          className="primary-btn mb-5 w-full"
        >
          刷新地图
        </button>
        <div className="mb-5 text-xs text-slate-400">最近更新时间：{lastUpdate || '--'}</div>
        <div className="mb-3 font-semibold text-slate-900">路口列表</div>
        <div className="min-h-0 flex-1 space-y-1.5 overflow-auto pr-1">
          {NODE_META.map((node) => {
            const record = latest.find((r) => r.node_id === node.id);
            const status = record?.congestion_status ?? 0;
            return (
              <div
                key={node.id}
                onClick={() => setSelectedNode({ node, record })}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 transition hover:bg-slate-50"
              >
                <div className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                  style={{ background: STATUS_COLOR[status] }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-800">{node.id}</div>
                  <div className="truncate text-xs text-slate-400">{node.name}</div>
                </div>
                <div className="text-xs text-slate-500">
                  {record ? `${record.speed}` : '--'}
                </div>
              </div>
            );
          })}
        </div>

        {/* 选中路口详情 */}
        {selectedNode && (
          <div className="mt-4 border-t border-[#e8eef2] pt-4">
            <div className="mb-2 font-semibold text-slate-900">
              {selectedNode.node.id} 详情
            </div>
            <div className="mb-2 text-sm leading-5 text-slate-500">{selectedNode.node.name}</div>
            {selectedNode.record ? (
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">当前车速</span>
                  <span className="font-medium text-slate-700">
                    {selectedNode.record.speed} km/h
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">拥堵状态</span>
                  <span className="font-medium"
                    style={{ color: STATUS_COLOR[selectedNode.record.congestion_status] }}>
                    {STATUS_LABEL[selectedNode.record.congestion_status]}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">采集时间</span>
                  <span className="text-xs text-slate-500">
                    {new Date(selectedNode.record.collected_at).toLocaleTimeString('zh')}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-400">暂无实时数据</div>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
