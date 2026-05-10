import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
});

// Add token if exists
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const fetchNodes = () => api.get('/api/nodes');

export const fetchLatestTraffic = () => api.get('/api/traffic/latest');

export const fetchTrafficHistory = (nodeId: string, limit = 24) =>
  api.get('/api/traffic/history', { params: { node_id: nodeId, limit } });

export const triggerPrediction = () => api.post('/api/predict/trigger');

export const fetchLatestPrediction = (horizon = 15, nodeId?: string) =>
  api.get('/api/predict/latest', { params: { horizon, node_id: nodeId } });

export const fetchPredictionOutlook = (nodeId: string) =>
  api.get('/api/predict/outlook', { params: { node_id: nodeId } });

export const fetchDashboardChart = (nodeId: string, date: string, horizon = 15) =>
  api.get('/api/dashboard/chart', { params: { node_id: nodeId, date, horizon } });

export const fetchRouteOutlook = (nodeIds: string[] | string, horizons: number[] = [30, 45, 60]) =>
  api.get('/api/route/outlook', {
    params: Array.isArray(nodeIds)
      ? { node_ids: nodeIds.join(','), horizons: horizons.join(',') }
      : { node_id: nodeIds, horizons: horizons.join(',') },
  });

export default api;
