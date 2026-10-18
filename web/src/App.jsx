import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { SessionProvider, useSession } from './lib/session.jsx';
import { AcceptInvite, Login } from './pages/Auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
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
        <Route index element={<Dashboard />} />
        <Route path="events" element={<EventList />} />
        <Route path="events/:id" element={<EventDetail />} />
        <Route path="setups" element={<SetupList />} />
        <Route path="compare" element={<Compare />} />
        <Route path="maintenance" element={<Maintenance />} />
        <Route path="assets" element={<AssetList />} />
        <Route path="assets/:id" element={<AssetDetail />} />
        <Route path="cars" element={<CarList />} />
        <Route path="r/:type/:id" element={<RecordEdit />} />
        <Route path="forms" element={<FormList />} />
        <Route path="forms/:id" element={<FormBuilder />} />
        <Route path="team" element={<Team />} />
        <Route path="roles" element={<Roles />} />
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
