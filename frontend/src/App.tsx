import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import type { ReactElement } from 'react';

function PrivateRoute({ children }: { children: ReactElement }) {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={
          <PrivateRoute>
            <div className="p-8 text-gray-600">Dashboard（即将实现）</div>
          </PrivateRoute>
        } />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}