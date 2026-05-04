import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Info, Layers, Maximize2, Minimize2, Navigation, RefreshCw } from 'lucide-react';
import api from '../api';
import { useToast } from '../components/ToastProvider';

declare global {
  interface Window {
    AMap: any;
    _AMapSecurityConfig: any;
  }
}

if (typeof window !== 'undefined') {
  window._AMapSecurityConfig = {
    securityJsCode: '8cb4c55595d659259cf0f9f771afe037',
  };
}

const AMAP_KEY = '8943e8243755045a43fa3bf25bf42aef';
const AMAP_SCRIPT_ID = 'amap-js-sdk';
const AMAP_SCRIPT_URL = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_KEY}`;
let amapSdkPromise: Promise<void> | null = null;

const NODE_META = [
  { id: 'A1', name: '天府大道-锦城大道路口', lng: 104.069093, lat: 30.575761 },
  { id: 'B2', name: '益州大道-锦城大道路口', lng: 104.059806, lat: 30.574761 },
  { id: 'C3', name: '成华大道-杉板桥路口', lng: 104.136395, lat: 30.673074 },
  { id: 'D4', name: '天府大道-华阳立交路口', lng: 104.067643, lat: 30.598064 },
  { id: 'E5', name: '剑南大道-锦城大道路口', lng: 104.047516, lat: 30.575108 },
  { id: 'F6', name: '益州大道-府城大道路口', lng: 104.060269, lat: 30.589527 },
  { id: 'G7', name: '天府三街-天府大道路口', lng: 104.069204, lat: 30.546203 },
  { id: 'H8', name: '科华南路-锦尚西二路口', lng: 104.0785, lat: 30.5892 },
  { id: 'I9', name: '中环路火车南站-科华南路口', lng: 104.077952, lat: 30.608579 },
  { id: 'J10', name: '东站西广场-邛崃山路路口', lng: 104.1356, lat: 30.6298 },
  { id: 'K11', name: '人民南路四段', lng: 104.066986, lat: 30.6194897 },
];

const STATUS_COLOR: Record<number, string> = {
  0: '#94a3b8',
  1: '#10b981',
  2: '#f59e0b',
  3: '#ef4444',
  4: '#991b1b',
};

const STATUS_LABEL: Record<number, string> = {
  0: '暂无数据',
  1: '畅通',
  2: '缓行',
  3: '拥堵',
  4: '严重拥堵',
};

const getNumericCoordinate = (value: unknown) => {
  const coordinate = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
};

const waitForContainerReady = (container: HTMLDivElement) =>
  new Promise<void>((resolve) => {
    const ensureSize = () => {
      if (container.clientWidth > 0 && container.clientHeight > 0) {
        resolve();
        return;
      }
      window.requestAnimationFrame(ensureSize);
    };

    ensureSize();
  });

const loadAMapSdkOnce = () =>
  new Promise<void>((resolve, reject) => {
    if (window.AMap) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[data-amap-sdk="${AMAP_KEY}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('AMap script failed to load')), { once: true });
      return;
    }

    const script = document.createElement('script');
    const timeout = window.setTimeout(() => {
      script.remove();
      reject(new Error('AMap script load timeout'));
    }, 12000);

    script.id = AMAP_SCRIPT_ID;
    script.type = 'text/javascript';
    script.src = AMAP_SCRIPT_URL;
    script.async = true;
    script.dataset.amapSdk = AMAP_KEY;
    script.onload = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      script.remove();
      reject(new Error('AMap script failed to load'));
    };
    document.head.appendChild(script);
  });

const loadAMapSdk = async () => {
  if (!amapSdkPromise) {
    amapSdkPromise = loadAMapSdkOnce().catch(async (error) => {
      amapSdkPromise = null;
      document.getElementById(AMAP_SCRIPT_ID)?.remove();
      await new Promise((resolve) => window.setTimeout(resolve, 800));
      return loadAMapSdkOnce().catch(() => {
        throw error;
      });
    });
  }

  await amapSdkPromise;
};

export default function MapView() {
  const { showToast } = useToast();
  const mapRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapShellRef = useRef<HTMLDivElement>(null);
  const overlaysRef = useRef<any[]>([]);
  const markersRef = useRef<Record<string, any>>({});
  const latestRef = useRef<any[]>([]);
  const selectedNodeIdRef = useRef<string | null>(null);
  const [latest, setLatest] = useState<any[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [lastUpdate, setLastUpdate] = useState('');
  const [loading, setLoading] = useState(false);
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [mapError, setMapError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const loadLatest = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/traffic/latest');
      const data = res.data.data || [];
      setLatest(data);
      latestRef.current = data;
      setLastUpdate(new Date().toLocaleTimeString('zh-CN'));
      return data;
    } catch (error) {
      const mock = NODE_META.map((node) => ({
        node_id: node.id,
        speed: Math.floor(Math.random() * 50) + 10,
        congestion_status: Math.floor(Math.random() * 4) + 1,
        collected_at: new Date().toISOString(),
      }));
      setLatest(mock);
      latestRef.current = mock;
      setLastUpdate(new Date().toLocaleTimeString('zh-CN'));
      return mock;
    } finally {
      setLoading(false);
    }
  };

  const syncMarkerFocus = (nodeId?: string) => {
    Object.entries(markersRef.current).forEach(([id, marker]) => {
      const record = latestRef.current.find((row) => row.node_id === id);
      const status = record?.congestion_status ?? 0;
      const active = id === nodeId;
      marker.setOptions?.({
        radius: active ? 17 : 12,
        strokeColor: active ? '#0f172a' : '#ffffff',
        strokeWeight: active ? 4 : 2,
        fillColor: STATUS_COLOR[status] ?? STATUS_COLOR[0],
        zIndex: active ? 200 : 100,
      });
    });
  };

  const focusNode = (nodeId: string, data = latestRef.current) => {
    const node = NODE_META.find((item) => item.id === nodeId);
    if (!node) return;

    const record = data.find((row) => row.node_id === nodeId);
    setSelectedNodeId(nodeId);
    setSelectedNode({ node, record });
    syncMarkerFocus(nodeId);

    const lng = getNumericCoordinate(node.lng);
    const lat = getNumericCoordinate(node.lat);
    if (mapRef.current && lng !== null && lat !== null) {
      mapRef.current.setZoomAndCenter?.(14, [lng, lat], false, 500);
    }
  };

  const updateMarkers = (data: any[]) => {
    if (!mapRef.current || !window.AMap) return;

    latestRef.current = data;
    const statusMap: Record<string, any> = {};
    data.forEach((row) => {
      statusMap[row.node_id] = row;
    });

    overlaysRef.current.forEach((overlay) => overlay.remove?.());
    overlaysRef.current = [];
    markersRef.current = {};

    NODE_META.forEach((node) => {
      const record = statusMap[node.id];
      const status = record?.congestion_status ?? 0;
      const color = STATUS_COLOR[status] ?? STATUS_COLOR[0];
      const lng = getNumericCoordinate(node.lng);
      const lat = getNumericCoordinate(node.lat);

      if (lng === null || lat === null) {
        console.error('Skipped invalid AMap marker coordinates', {
          nodeId: node.id,
          nodeName: node.name,
          lng: node.lng,
          lat: node.lat,
        });
        return;
      }

      const marker = new window.AMap.CircleMarker({
        center: [lng, lat],
        radius: selectedNodeIdRef.current === node.id ? 17 : 12,
        fillColor: color,
        fillOpacity: 0.9,
        strokeColor: selectedNodeIdRef.current === node.id ? '#0f172a' : '#ffffff',
        strokeWeight: selectedNodeIdRef.current === node.id ? 4 : 2,
        cursor: 'pointer',
        zIndex: selectedNodeIdRef.current === node.id ? 200 : 100,
        extData: { node, record },
      });

      const label = new window.AMap.Text({
        text: node.id,
        position: [lng, lat],
        offset: new window.AMap.Pixel(-10, -8),
        style: {
          fontSize: '11px',
          fontWeight: '700',
          color: '#ffffff',
          backgroundColor: 'transparent',
          border: 'none',
          padding: '0',
        },
      });

      marker.on('click', () => {
        focusNode(node.id, data);
      });
      label.on?.('click', () => {
        focusNode(node.id, data);
      });

      marker.setMap(mapRef.current);
      label.setMap(mapRef.current);
      markersRef.current[node.id] = marker;
      overlaysRef.current.push(marker, label);
    });

    mapRef.current.setFitView?.(Object.values(markersRef.current), false, [80, 80, 80, 80], 13);
  };

  useEffect(() => {
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;

    const initMap = async () => {
      try {
        setMapStatus('loading');
        setMapError('');
        const data = await loadLatest();
        await loadAMapSdk();

        if (!containerRef.current || !window.AMap) return;

        await waitForContainerReady(containerRef.current);
        if (disposed) return;

        const map = new window.AMap.Map(containerRef.current, {
          viewMode: '2D',
          zoom: 12,
          center: [104.082, 30.592],
          mapStyle: 'amap://styles/light', // 使用高德提供的标准底图样式:normal/light/dark/fresh/graffiti/blue/wine/darkblue/whitesmok/grey/macaron
          resizeEnable: true,
          showLabel: true,
          features: ['bg', 'road', 'building'],
        });

        mapRef.current = map;
        let rendered = false;
        const renderMapMarkers = () => {
          if (disposed || rendered) return;
          rendered = true;
          map.resize?.();
          updateMarkers(data);
          setMapStatus('ready');
        };

        map.on('complete', () => {
          renderMapMarkers();
        });
        window.setTimeout(renderMapMarkers, 2500);

        resizeObserver = new ResizeObserver(() => {
          mapRef.current?.resize?.();
        });
        resizeObserver.observe(containerRef.current);

        window.requestAnimationFrame(() => mapRef.current?.resize?.());
      } catch (error) {
        console.error('Map initialization failed', error);
        setMapStatus('error');
        setMapError(error instanceof Error ? error.message : '地图初始化失败');
      }
    };

    const handleWindowError = (event: ErrorEvent) => {
      const message = event.message || '';
      const filename = event.filename || '';
      if (filename.includes('webapi.amap.com') || message.includes('LngLat') || message.includes('AMap')) {
        setMapStatus('error');
        setMapError(message || '高德地图脚本发生异常');
      }
    };

    window.addEventListener('error', handleWindowError);

    initMap();

    return () => {
      window.removeEventListener('error', handleWindowError);
      disposed = true;
      resizeObserver?.disconnect();
      overlaysRef.current.forEach((overlay) => overlay.remove?.());
      overlaysRef.current = [];
      markersRef.current = {};
      mapRef.current?.destroy?.();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
    syncMarkerFocus(selectedNodeId || undefined);
  }, [selectedNodeId]);

  useEffect(() => {
    if (!selectedNodeId) {
      setSelectedNode(null);
      return;
    }

    const node = NODE_META.find((item) => item.id === selectedNodeId);
    if (!node) {
      setSelectedNode(null);
      return;
    }

    const record = latest.find((row) => row.node_id === selectedNodeId);
    setSelectedNode({ node, record });
  }, [latest, selectedNodeId]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = document.fullscreenElement === mapShellRef.current;
      setIsFullscreen(active);
      window.requestAnimationFrame(() => mapRef.current?.resize?.());
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleToggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await mapShellRef.current?.requestFullscreen?.();
      } else if (document.fullscreenElement === mapShellRef.current) {
        await document.exitFullscreen();
      }
      window.requestAnimationFrame(() => mapRef.current?.resize?.());
    } catch (error) {
      console.error('Fullscreen toggle failed', error);
      showToast('全屏切换失败', 'error');
    }
  };

  const handleRefresh = async () => {
    try {
      const data = await loadLatest();
      updateMarkers(data);
      if (selectedNode?.node.id) {
        focusNode(selectedNode.node.id, data);
      }
      showToast('地图数据已刷新', 'success');
    } catch {
      showToast('地图刷新失败，请稍后重试', 'error');
    }
  };

  return (
    <div className="space-y-5 pb-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-950">实时路网地图</h1>
          <p className="mt-1 text-[11px] font-semibold tracking-wide text-slate-500">
            读取最新路况数据并在地图上展示核心路口的拥堵状态与通行速度。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200/60 bg-white px-4 py-2 shadow-soft">
            <RefreshCw className={`h-4 w-4 text-brand-500 ${loading ? 'animate-spin' : ''}`} />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              最近同步 {lastUpdate || '--'}
            </span>
          </div>
          <button onClick={handleRefresh} className="btn-primary gap-2">
            <Layers className="h-4 w-4" />
            <span>刷新地图</span>
          </button>
        </div>
      </div>

      <div className="console-card bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">路口列表</h3>
            <p className="mt-1 text-[10px] font-bold uppercase text-slate-400">点击路口卡片可同步聚焦地图标记</p>
          </div>
          {selectedNode && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-white">
              <div className="flex items-center gap-2">
                <Navigation className="h-3 w-3 text-brand-400" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-400">{selectedNode.node.id} 已选中</span>
              </div>
              <span className="text-xs font-black data-mono">{selectedNode.record?.speed ?? '--'} km/h</span>
              <span
                className="text-[10px] font-black uppercase tracking-widest"
                style={{ color: STATUS_COLOR[selectedNode.record?.congestion_status ?? 0] }}
              >
                {STATUS_LABEL[selectedNode.record?.congestion_status ?? 0]}
              </span>
              <span className="max-w-[16rem] truncate text-[10px] font-bold text-slate-400">{selectedNode.node.name}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {NODE_META.map((node) => {
            const record = latest.find((row) => row.node_id === node.id);
            const isActive = selectedNodeId === node.id;
            return (
              <motion.button
                key={node.id}
                whileHover={{ y: -2 }}
                onClick={() => focusNode(node.id)}
                className={`flex min-w-0 items-center justify-between rounded-2xl border px-3.5 py-3 text-left transition-all ${
                  isActive
                    ? 'border-slate-900 bg-slate-900 shadow-xl'
                    : 'border-slate-100/70 bg-slate-50/70 hover:border-slate-200 hover:bg-white'
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[10px] font-black ${
                      isActive ? 'bg-white/10 text-brand-400' : 'bg-white text-slate-500 shadow-sm'
                    }`}
                  >
                    {node.id}
                  </div>
                  <div className="min-w-0">
                    <div className={`text-[10px] font-black uppercase tracking-tight ${isActive ? 'text-white' : 'text-slate-800'}`}>
                      {node.id} 路口
                    </div>
                    <div className="max-w-[7rem] truncate text-[10px] font-medium text-slate-400">{node.name}</div>
                  </div>
                </div>
                <div className={`ml-3 shrink-0 text-[10px] font-black data-mono ${isActive ? 'text-brand-400' : 'text-slate-500'}`}>
                  {record ? `${record.speed} km/h` : '--'}
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-5 ${isFullscreen ? 'h-screen' : 'h-[calc(100vh-330px)] min-h-[380px] max-h-[560px]'}`}>
        <div className="flex min-h-0 flex-col">
          <div ref={mapShellRef} className={`console-card flex min-h-0 flex-1 flex-col p-4 shadow-lg ${isFullscreen ? 'rounded-none p-6' : ''}`}>
            <div className="relative min-h-0 flex-1 overflow-hidden rounded-[1.5rem] bg-slate-100">
              <div ref={containerRef} className="h-full w-full" />

              <div className="absolute left-4 top-4 z-10 flex flex-wrap gap-2">
                {Object.entries(STATUS_LABEL).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-center gap-2 rounded-full border border-white/60 bg-white/90 px-2.5 py-1.5 backdrop-blur-md"
                  >
                    <div className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_COLOR[Number(key)] }} />
                    <span className="text-[10px] font-black text-slate-700">{value}</span>
                  </div>
                ))}
              </div>

              <div className="absolute right-4 top-4 z-10">
                <button
                  type="button"
                  onClick={handleToggleFullscreen}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/70 bg-white/90 text-slate-700 shadow-sm transition-colors hover:bg-white"
                >
                  {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
              </div>

              {mapStatus !== 'ready' && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/70 backdrop-blur-sm">
                  <div className="rounded-3xl border border-slate-200 bg-white px-6 py-5 text-center shadow-lg">
                    <div className="text-sm font-black text-slate-900">
                      {mapStatus === 'loading' ? '地图加载中...' : '地图未正常渲染'}
                    </div>
                    <div className="mt-2 max-w-sm text-xs leading-5 text-slate-500">
                      {mapError || '正在等待高德地图脚本、容器尺寸和底图层完成初始化。'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="hidden">
          <div className="console-card flex min-h-0 flex-1 flex-col bg-white">
            <div className="border-b border-slate-50 p-6">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">路口列表</h3>
              <p className="mt-1 text-[10px] font-bold uppercase text-slate-400">核心节点状态总览</p>
            </div>

            <div className="custom-scrollbar flex-1 space-y-2 overflow-y-auto p-4">
              {NODE_META.map((node) => {
                const record = latest.find((row) => row.node_id === node.id);
                return (
                  <motion.button
                    key={node.id}
                    whileHover={{ x: 4 }}
                    onClick={() => focusNode(node.id)}
                    className={`flex w-full items-center justify-between rounded-2xl border p-3.5 text-left transition-all ${
                      selectedNode?.node.id === node.id
                        ? 'border-slate-900 bg-slate-900 shadow-xl'
                        : 'border-slate-100/60 bg-slate-50/50 hover:border-slate-200 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-xl text-[10px] font-black ${
                          selectedNode?.node.id === node.id ? 'bg-white/10 text-brand-400' : 'bg-white text-slate-500 shadow-sm'
                        }`}
                      >
                        {node.id}
                      </div>
                      <div className="min-w-0">
                        <div className={`text-[10px] font-black uppercase tracking-tight ${selectedNode?.node.id === node.id ? 'text-white' : 'text-slate-800'}`}>
                          {node.id} 路口
                        </div>
                        <div className="w-28 truncate text-[10px] font-medium text-slate-400">{node.name}</div>
                      </div>
                    </div>
                    <div className={`text-[10px] font-black data-mono ${selectedNode?.node.id === node.id ? 'text-brand-400' : 'text-slate-500'}`}>
                      {record ? `${record.speed} km/h` : '--'}
                    </div>
                  </motion.button>
                );
              })}
            </div>

            <AnimatePresence mode="wait">
              {selectedNode ? (
                <motion.div
                  key={selectedNode.node.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="rounded-b-3xl border-t border-white/5 bg-slate-900 p-6 text-white"
                >
                  <div className="mb-4 flex items-center gap-2">
                    <Navigation className="h-3 w-3 text-brand-400" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-400">节点详情</span>
                  </div>
                  <h4 className="mb-1 text-lg font-black tracking-tight">{selectedNode.node.id} 已选中</h4>
                  <p className="mb-5 truncate text-[10px] font-bold uppercase text-slate-400">{selectedNode.node.name}</p>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-white/5 py-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">当前车速</span>
                      <span className="text-sm font-black data-mono text-white">
                        {selectedNode.record?.speed ?? '--'} km/h
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-b border-white/5 py-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">拥堵状态</span>
                      <span
                        className="text-[10px] font-black uppercase tracking-widest"
                        style={{ color: STATUS_COLOR[selectedNode.record?.congestion_status ?? 0] }}
                      >
                        {STATUS_LABEL[selectedNode.record?.congestion_status ?? 0]}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">采集时间</span>
                      <span className="text-xs font-bold text-slate-400">
                        {selectedNode.record?.collected_at
                          ? new Date(selectedNode.record.collected_at).toLocaleTimeString('zh-CN')
                          : '--'}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-b-3xl bg-slate-50 p-8 text-center">
                  <Info className="mb-2 h-6 w-6 text-slate-300" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">请选择路口查看详情</p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
