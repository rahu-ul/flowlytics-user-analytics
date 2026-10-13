import { buildHref, useRoute } from './router.js';
import AppShell from './components/ui/AppShell.jsx';
import PageHeader from './components/ui/PageHeader.jsx';
import { EmptyState } from './components/ui/States.jsx';
import OverviewView from './views/OverviewView.jsx';
import SessionsView from './views/SessionsView.jsx';
import HeatmapView from './views/HeatmapView.jsx';

function NotFound() {
  return (
    <>
      <PageHeader title="Page not found" />
      <EmptyState title="That address does not match a page in the dashboard." action={<a className="btn" href={buildHref(['overview'])}>Go to Overview</a>} />
    </>
  );
}

export default function App() {
  const route = useRoute();
  const first = route.segs[0] || 'overview';
  const section = first === 'heatmap' ? 'heatmaps' : first; // /#/heatmap was the old tab name

  let view;
  if (section === 'overview') view = <OverviewView />;
  else if (section === 'sessions') view = <SessionsView route={route} />;
  else if (section === 'heatmaps') view = <HeatmapView route={route} />;
  else view = <NotFound />;

  return <AppShell section={section} routeKey={route.segs.join('/')}>{view}</AppShell>;
}
