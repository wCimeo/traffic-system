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
    {"id": "C3",  "name": "天府大道-府城大道路口",      "lng": 104.068268, "lat": 30.588043},
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
    <div className="flex h-full">
      {/* 地图主体 */}
      <div className="flex-1 flex flex-col p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-800">实时路网地图</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              点击路口节点查看详情 · 最后更新：{lastUpdate || '--'}
            </p>
          </div>
          <button
            onClick={handleRefresh}
            className="bg-emerald-500 hover:bg-emerald-600 text-white text-sm px-4 py-2 rounded-lg transition"
          >
            刷新地图
          </button>
        </div>

        {/* 图例 */}
        <div className="flex items-center gap-4 mb-3">
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full"
                style={{ background: STATUS_COLOR[Number(k)] }} />
              <span className="text-xs text-gray-500">{v}</span>
            </div>
          ))}
        </div>

        {/* 地图容器 */}
        <div ref={containerRef} className="flex-1 rounded-2xl overflow-hidden shadow-sm" />
      </div>

      {/* 右侧面板 */}
      <div className="w-64 bg-white border-l border-gray-100 flex flex-col p-4">
        <div className="font-semibold text-gray-800 mb-3">路口列表</div>
        <div className="space-y-1.5 overflow-auto flex-1">
          {NODE_META.map((node) => {
            const record = latest.find((r) => r.node_id === node.id);
            const status = record?.congestion_status ?? 0;
            return (
              <div
                key={node.id}
                onClick={() => setSelectedNode({ node, record })}
                className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-50 transition"
              >
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: STATUS_COLOR[status] }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-700">{node.id}</div>
                  <div className="text-xs text-gray-400 truncate">{node.name}</div>
                </div>
                <div className="text-xs text-gray-500">
                  {record ? `${record.speed}` : '--'}
                </div>
              </div>
            );
          })}
        </div>

        {/* 选中路口详情 */}
        {selectedNode && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="font-semibold text-gray-800 mb-2">
              {selectedNode.node.id} 详情
            </div>
            <div className="text-sm text-gray-500 mb-2">{selectedNode.node.name}</div>
            {selectedNode.record ? (
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">当前车速</span>
                  <span className="font-medium text-gray-700">
                    {selectedNode.record.speed} km/h
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">拥堵状态</span>
                  <span className="font-medium"
                    style={{ color: STATUS_COLOR[selectedNode.record.congestion_status] }}>
                    {STATUS_LABEL[selectedNode.record.congestion_status]}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">采集时间</span>
                  <span className="text-gray-500 text-xs">
                    {new Date(selectedNode.record.collected_at).toLocaleTimeString('zh')}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-400">暂无实时数据</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}