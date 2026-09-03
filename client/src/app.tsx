import React, { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';

import Layout from './components/Layout';

const HomePage = lazy(() => import('./pages/HomePage/HomePage'));
const RoomPage = lazy(() => import('./pages/RoomPage/RoomPage'));
const MahjongRoomPage = lazy(() => import('./pages/MahjongRoomPage/MahjongRoomPage'));
const NotFound = lazy(() => import('./pages/NotFound/NotFound'));

const fallback = (
  <div
    className="min-h-screen w-full flex items-center justify-center"
    style={{
      background: '#F4F6F1',
      color: '#6B7A70',
      fontSize: '14px',
    }}
  >
    加载中...
  </div>
);

const RoutesComponent = () => {
  return (
    <Suspense fallback={fallback}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="room/:roomCode" element={<RoomPage />} />
          <Route path="mahjong/:roomCode" element={<MahjongRoomPage />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
};

export default RoutesComponent;
