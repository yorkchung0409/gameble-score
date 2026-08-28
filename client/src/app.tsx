import React from 'react';
import { Route, Routes } from 'react-router-dom';

import Layout from './components/Layout';
import HomePage from './pages/HomePage/HomePage';
import RoomPage from './pages/RoomPage/RoomPage';
import MahjongRoomPage from './pages/MahjongRoomPage/MahjongRoomPage';
import NotFound from './pages/NotFound/NotFound';

const RoutesComponent = () => {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="room/:roomCode" element={<RoomPage />} />
        <Route path="mahjong/:roomCode" element={<MahjongRoomPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default RoutesComponent;
