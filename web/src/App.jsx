import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { SessionProvider, useSession } from './lib/session.jsx';
import { AcceptInvite, Login } from './pages/Auth.jsx';
import { AreaGate, Landing, TeamHub, TrackHub, WorkshopHub } from './pages/Areas.jsx';
import { CrewStats, Dyno, Engines, Reports, Reviews, TrackChecks } from './pages/Phase2.jsx';
import { GearsTires } from './pages/Gears.jsx';
import { EventDetail, EventList } from './pages/Events.jsx';
import { Compare, SetupList } from './pages/Setups.jsx';
import { Maintenance } from './pages/Maintenance.jsx';
import { AssetDetail, AssetList, CarList } from './pages/Assets.jsx';
import RecordEdit from './pages/RecordEdit.jsx';
import { FormBuilder, FormList } from './pages/Forms.jsx';
import { AdminTeams, Profile, Roles, Team } from './pages/Team.jsx';

function NoTeam() {
  const { logout, user } = useSession();
  return (
    <div className="auth-wrap"><div className="auth-card card">
      <h1>No team yet</h1>
      <p className="muted">{user?.email} isn't a member of any team. Ask a team owner for an invite link.</p>
      <button type="button" className="btn" onClick={() => logout(true)}>Sign out</button>
    </div></div>
  );
}

function Routed() {
  const { session, membership } = useSession();
  if (!session?.token) {
    return (
      <Routes>
        <Route path="/invite/:token" element={<AcceptInvite />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }
  if (!membership) {
    return (
      <Routes>
        <Route path="/invite/:token" element={<AcceptInvite />} />
        <Route path="*" element={<NoTeam />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route path="/invite/:token" element={<AcceptInvite />} />
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<Layout />}>
        <Route index element={<Landing />} />
        {/* At the track */}
        <Route path="track" element={<AreaGate area="track"><TrackHub /></AreaGate>} />
        <Route path="events" element={<AreaGate area="track" module="events"><EventList /></AreaGate>} />
        <Route path="events/:id" element={<AreaGate area="track" module="events"><EventDetail /></AreaGate>} />
        <Route path="setups" element={<AreaGate area="track" module="setups"><SetupList /></AreaGate>} />
        <Route path="track/checks" element={<AreaGate area="track" module="trackside"><TrackChecks /></AreaGate>} />
        <Route path="track/gears" element={<AreaGate area="track" module="gears"><GearsTires /></AreaGate>} />
        {/* Workshop */}
        <Route path="workshop" element={<AreaGate area="workshop"><WorkshopHub /></AreaGate>} />
        <Route path="maintenance" element={<AreaGate area="workshop" module="maintenance"><Maintenance /></AreaGate>} />
        <Route path="assets" element={<AreaGate area="workshop" module="assets"><AssetList /></AreaGate>} />
        <Route path="assets/:id" element={<AreaGate area="workshop" module="assets"><AssetDetail /></AreaGate>} />
        <Route path="workshop/dyno" element={<AreaGate area="workshop" module="dyno"><Dyno /></AreaGate>} />
        {/* Engines */}
        <Route path="engines" element={<AreaGate area="engines" module="engines"><Engines /></AreaGate>} />
        {/* Team management */}
        <Route path="team" element={<AreaGate area="team"><TeamHub /></AreaGate>} />
        <Route path="team/members" element={<Team />} />
        <Route path="team/reports" element={<AreaGate area="team" module="reports"><Reports /></AreaGate>} />
        <Route path="team/stats" element={<AreaGate area="team" module="reports"><CrewStats /></AreaGate>} />
        <Route path="team/reviews" element={<AreaGate area="team" module="reviews"><Reviews /></AreaGate>} />
        <Route path="roles" element={<Roles />} />
        <Route path="forms" element={<FormList />} />
        <Route path="forms/:id" element={<FormBuilder />} />
        <Route path="cars" element={<CarList />} />
        <Route path="compare" element={<Compare />} />
        <Route path="r/:type/:id" element={<RecordEdit />} />
        <Route path="profile" element={<Profile />} />
        <Route path="admin/teams" element={<AdminTeams />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter><Routed /></BrowserRouter>
    </SessionProvider>
  );
}
