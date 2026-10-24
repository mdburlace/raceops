import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { SessionProvider, useSession } from './lib/session.jsx';
import { AcceptInvite, Login } from './pages/Auth.jsx';
import { AreaGate, Landing, ModuleGate, TeamHub, TrackHub, WorkshopHub } from './pages/Areas.jsx';
import { CrewStats, Dyno, Engines, Reports, Reviews, TrackChecks } from './pages/Phase2.jsx';
import { GearsTires } from './pages/Gears.jsx';
import { TrackDetail, TrackDirectory } from './pages/Tracks.jsx';
import { ContactDetail, ContactList, SupplierList } from './pages/Contacts.jsx';
import { SeriesDetail, SeriesList } from './pages/Series.jsx';
import { EventDetail, EventList } from './pages/Events.jsx';
import { Compare, SetupList } from './pages/Setups.jsx';
import { Maintenance } from './pages/Maintenance.jsx';
import { AssetDetail, AssetList, CarList } from './pages/Assets.jsx';
import RecordEdit from './pages/RecordEdit.jsx';
import { FormBuilder, FormList } from './pages/Forms.jsx';
import { Profile, Roles, Team } from './pages/Team.jsx';
import { AskPage } from './components/Ai.jsx';
import { Calculators } from './pages/Calculators.jsx';
import { HelpArticle, HelpHome, HelpPrint } from './pages/Help.jsx';
import { ReleaseDetail, ReleaseList } from './pages/Releases.jsx';
import { FeedbackPage } from './pages/Feedback.jsx';
import { AdminFeedback } from './pages/FeedbackAdmin.jsx';
import { AnalyticsPage } from './pages/Analytics.jsx';
import { AdminCalendar, CalendarPage, CalendarPrint, PublicCalendar, PublicShared } from './pages/Calendar.jsx';
import { CustomerDetail, CustomerList, JobList, JobPrint } from './pages/Shop.jsx';
import { LinkEngine, LinkedEngineDetail, SharePage } from './pages/Sharing.jsx';
import { AdvisorPage, GuideEdit, GuideList } from './pages/Advisor.jsx';
import { AdminBackups, TeamBackups } from './pages/Backups.jsx';
import { AdminDeleted, RecentlyDeleted } from './pages/Deleted.jsx';
import { WorkshopSetups } from './pages/WorkshopSetups.jsx';
import { CheckPrint, EngineCheckList, EngineTunes, TunePrint } from './pages/EngineTunes.jsx';
import TeardownPrint from './pages/TeardownPrint.jsx';
import { BusinessHub, Purchases, RemindersPage } from './pages/Business.jsx';
import { Finance } from './pages/Finance.jsx';
import { Transport } from './pages/Transport.jsx';
import { Marketing, Partnerships, SponsorDetail, SponsorPortal, SponsorPrint } from './pages/Partners.jsx';
import { AdminDirectory, AdminGate, AdminLists, AdminOverview, AdminPlans, AdminSettings, AdminSystem, AdminTeams, AdminUsers, AdminAi } from './pages/Admin.jsx';

/** A fresh record page per record — moving between records never carries one's state into another. */
function RecordRoute() {
  const { type, id } = useParams();
  return <RecordEdit key={`${type}/${id}`} />;
}

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
      <Route path="/s/:token" element={<SharePage />} />
      <Route path="/c/:token" element={<PublicCalendar />} />
      <Route path="/cal/:type/:id" element={<PublicShared />} />
      <Route path="/sp/:token" element={<SponsorPortal />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }
  if (!membership) {
    return (
      <Routes>
        <Route path="/invite/:token" element={<AcceptInvite />} />
      <Route path="/s/:token" element={<SharePage />} />
      <Route path="/c/:token" element={<PublicCalendar />} />
      <Route path="/cal/:type/:id" element={<PublicShared />} />
      <Route path="/sp/:token" element={<SponsorPortal />} />
        <Route path="*" element={<NoTeam />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route path="/invite/:token" element={<AcceptInvite />} />
      <Route path="/s/:token" element={<SharePage />} />
      <Route path="/c/:token" element={<PublicCalendar />} />
      <Route path="/cal/:type/:id" element={<PublicShared />} />
      <Route path="/sp/:token" element={<SponsorPortal />} />
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/print/tune/:id" element={<ModuleGate module="enginetunes"><TunePrint /></ModuleGate>} />
      <Route path="/print/engine-check/:id" element={<AreaGate area="workshop" module="enginechecks"><CheckPrint /></AreaGate>} />
      <Route path="/print/teardown/:id" element={<AreaGate area="engines" module="engines"><TeardownPrint /></AreaGate>} />
      <Route path="/print/job/:id" element={<AreaGate area="engines" module="jobs"><JobPrint /></AreaGate>} />
      <Route path="/print/guide" element={<HelpPrint />} />
      <Route path="/print/calendar" element={<ModuleGate module="calendar"><CalendarPrint /></ModuleGate>} />
      <Route path="/print/sponsor/:id" element={<ModuleGate module="partnerships"><SponsorPrint /></ModuleGate>} />
      <Route element={<Layout />}>
        <Route index element={<Landing />} />
        {/* At the track */}
        <Route path="track" element={<AreaGate area="track"><TrackHub /></AreaGate>} />
        <Route path="events" element={<AreaGate area="track" module="events"><EventList /></AreaGate>} />
        <Route path="events/:id" element={<AreaGate area="track" module="events"><EventDetail /></AreaGate>} />
        <Route path="tracks" element={<AreaGate area="track" module="tracks"><TrackDirectory /></AreaGate>} />
        <Route path="tracks/:id" element={<AreaGate area="track" module="tracks"><TrackDetail /></AreaGate>} />
        <Route path="series" element={<AreaGate area="track" module="events"><SeriesList /></AreaGate>} />
        <Route path="series/:id" element={<AreaGate area="track" module="events"><SeriesDetail /></AreaGate>} />
        <Route path="setups" element={<AreaGate area="track" module="setups"><SetupList /></AreaGate>} />
        <Route path="track/advisor" element={<AreaGate area="track" module="setups"><AdvisorPage /></AreaGate>} />
        <Route path="track/advisor/guides" element={<AreaGate area="track" module="setups"><GuideList /></AreaGate>} />
        <Route path="track/advisor/guides/:id" element={<AreaGate area="track" module="setups"><GuideEdit /></AreaGate>} />
        <Route path="track/checks" element={<AreaGate area="track" module="trackside"><TrackChecks /></AreaGate>} />
        <Route path="track/gears" element={<AreaGate area="track" module="gears"><GearsTires /></AreaGate>} />
        {/* Workshop */}
        <Route path="workshop" element={<AreaGate area="workshop"><WorkshopHub /></AreaGate>} />
        <Route path="maintenance" element={<AreaGate area="workshop" module="maintenance"><Maintenance /></AreaGate>} />
        <Route path="assets" element={<AreaGate area="workshop" module="assets"><AssetList /></AreaGate>} />
        <Route path="assets/:id" element={<AreaGate area="workshop" module="assets"><AssetDetail /></AreaGate>} />
        <Route path="workshop/dyno" element={<AreaGate area="workshop" module="dyno"><Dyno /></AreaGate>} />
        <Route path="tunes" element={<ModuleGate module="enginetunes"><EngineTunes /></ModuleGate>} />
        <Route path="workshop/engine-checks" element={<AreaGate area="workshop" module="enginechecks"><EngineCheckList /></AreaGate>} />
        <Route path="workshop/setups" element={<AreaGate area="workshop" module="shopsetups"><WorkshopSetups /></AreaGate>} />
        {/* Engines */}
        <Route path="engines" element={<AreaGate area="engines" module="engines"><Engines /></AreaGate>} />
        <Route path="jobs" element={<AreaGate area="engines" module="jobs"><JobList /></AreaGate>} />
        <Route path="engines/linked/:id" element={<AreaGate area="engines" module="engines"><LinkedEngineDetail /></AreaGate>} />
        <Route path="link-engine/:code" element={<LinkEngine />} />
        <Route path="customers" element={<AreaGate area="engines" module="customers"><CustomerList /></AreaGate>} />
        <Route path="customers/:id" element={<AreaGate area="engines" module="customers"><CustomerDetail /></AreaGate>} />
        {/* Team management */}
        <Route path="team" element={<AreaGate area="team"><TeamHub /></AreaGate>} />
        <Route path="calendar" element={<ModuleGate module="calendar"><CalendarPage /></ModuleGate>} />
        <Route path="team/members" element={<Team />} />
        <Route path="team/backups" element={<TeamBackups />} />
        <Route path="deleted" element={<RecentlyDeleted />} />
        <Route path="team/reports" element={<AreaGate area="team" module="reports"><Reports /></AreaGate>} />
        <Route path="team/stats" element={<AreaGate area="team" module="reports"><CrewStats /></AreaGate>} />
        <Route path="team/reviews" element={<AreaGate area="team" module="reviews"><Reviews /></AreaGate>} />
        <Route path="roles" element={<Roles />} />
        <Route path="forms" element={<FormList />} />
        <Route path="forms/:id" element={<FormBuilder />} />
        <Route path="cars" element={<CarList />} />
        <Route path="contacts" element={<ContactList />} />
        <Route path="contacts/:id" element={<ContactDetail />} />
        <Route path="suppliers" element={<SupplierList />} />
        <Route path="compare" element={<Compare />} />
        <Route path="r/:type/:id" element={<RecordRoute />} />
        <Route path="profile" element={<Profile />} />
        {/* Business */}
        <Route path="business" element={<BusinessHub />} />
        <Route path="reminders" element={<RemindersPage />} />
        <Route path="purchases" element={<ModuleGate module="purchases"><Purchases /></ModuleGate>} />
        <Route path="finance" element={<ModuleGate module="finance"><Finance /></ModuleGate>} />
        <Route path="transport" element={<ModuleGate module="transport"><Transport /></ModuleGate>} />
        <Route path="partners" element={<ModuleGate module="partnerships"><Partnerships /></ModuleGate>} />
        <Route path="partners/sponsors/:id" element={<ModuleGate module="partnerships"><SponsorDetail /></ModuleGate>} />
        <Route path="marketing" element={<ModuleGate module="marketing"><Marketing /></ModuleGate>} />
        {/* Platform admin */}
        <Route path="admin" element={<AdminGate><AdminOverview /></AdminGate>} />
        <Route path="admin/calendar" element={<AdminGate><AdminCalendar /></AdminGate>} />
        <Route path="admin/feedback" element={<AdminGate><AdminFeedback /></AdminGate>} />
        <Route path="admin/teams" element={<AdminGate><AdminTeams /></AdminGate>} />
        <Route path="admin/plans" element={<AdminGate><AdminPlans /></AdminGate>} />
        <Route path="admin/users" element={<AdminGate><AdminUsers /></AdminGate>} />
        <Route path="admin/directory" element={<AdminGate><AdminDirectory /></AdminGate>} />
        <Route path="admin/lists" element={<AdminGate><AdminLists /></AdminGate>} />
        <Route path="admin/settings" element={<AdminGate><AdminSettings /></AdminGate>} />
        <Route path="admin/system" element={<AdminGate><AdminSystem /></AdminGate>} />
        <Route path="admin/backups" element={<AdminGate><AdminBackups /></AdminGate>} />
        <Route path="admin/deleted" element={<AdminGate><AdminDeleted /></AdminGate>} />
        <Route path="admin/ai" element={<AdminGate><AdminAi /></AdminGate>} />
        <Route path="ask" element={<AskPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="help" element={<HelpHome />} />
        <Route path="feedback" element={<FeedbackPage />} />
        <Route path="help/releases" element={<ReleaseList />} />
        <Route path="help/releases/:version" element={<ReleaseDetail />} />
        <Route path="help/:id" element={<HelpArticle />} />
        <Route path="calculators" element={<Calculators />} />
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
