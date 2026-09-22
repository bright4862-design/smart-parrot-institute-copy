import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/lib/AuthContext';
import AppLayout from '@/components/layout/AppLayout';
import PageNotFound from '@/lib/PageNotFound';

const Learn = lazy(() => import('@/pages/Learn'));
const LessonPage = lazy(() => import('@/pages/LessonPage'));
const LessonBookingHub = lazy(() => import('@/pages/LessonBookingHub'));
const LessonBooking = lazy(() => import('@/pages/LessonBooking'));
const MyLessons = lazy(() => import('@/pages/MyLessons'));
const LessonBookingPolicy = lazy(() => import('@/pages/LessonBookingPolicy'));
const LessonBookingAdmin = lazy(() => import('@/pages/LessonBookingAdmin'));
const Leaderboard = lazy(() => import('@/pages/Leaderboard'));
const Profile = lazy(() => import('@/pages/Profile'));
const LondonMission = lazy(() => import('@/pages/LondonMission'));
const AdventurePrototype = lazy(() => import('@/pages/adventure-prototype'));
const CafeMission = lazy(() => import('@/pages/CafeMission'));

const Loading = () => (
  <div className="min-h-screen grid place-items-center bg-slate-950 text-white">
    <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" />
  </div>
);

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<LondonMission />} />

            <Route element={<AppLayout />}>
              <Route path="/learn" element={<Learn />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/profile" element={<Profile />} />
            </Route>

            <Route path="/lesson/:id" element={<LessonPage />} />
            <Route path="/lesson-booking" element={<LessonBookingHub />} />
            <Route path="/book-lessons" element={<LessonBooking />} />
            <Route path="/my-lessons" element={<MyLessons />} />
            <Route path="/lesson-booking-policy/:policyVersionId" element={<LessonBookingPolicy />} />
            <Route path="/lesson-booking-admin" element={<LessonBookingAdmin />} />
            <Route path="/london" element={<LondonMission />} />
            <Route path="/heathrow-mission" element={<LondonMission />} />
            <Route path="/adventure-prototype" element={<AdventurePrototype />} />
            <Route path="/level-4-cafe" element={<CafeMission />} />
            <Route path="/london-cafe" element={<CafeMission />} />

            <Route path="*" element={<PageNotFound />} />
          </Routes>
        </Suspense>
      </Router>
    </AuthProvider>
  );
}
