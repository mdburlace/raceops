// The "Set up your team" checklist on Home (and in Help → Getting started). Each step is done
// when the team's own data shows it — nothing to tick by hand. ctx: { list(type), settings,
// members (count), teamType }. Steps link to the guide article that explains them.
const has = (ctx, type, fn = () => true) => ctx.list(type).some(fn);
const val = (r, k) => r?.data?.values?.[k];
const filled = (x) => x !== undefined && x !== null && x !== '';

export const CHECKLIST = [
  { id: 'type', label: 'Choose your team type', article: 'team-type', link: '/team/members', admin: true, done: (c) => !!c.settings?.team_type },
  { id: 'crew', label: 'Invite your crew', article: 'members-invites', link: '/team/members', admin: true, done: (c) => c.members > 1 },
  { id: 'car', label: 'Add your car', article: 'cars', link: '/r/car/new', race: true, done: (c) => has(c, 'car') },
  { id: 'car_setup', label: 'Set the car’s ring & pinion and minimum fuel', article: 'cars', link: '/cars', race: true, done: (c) => has(c, 'car', (r) => filled(val(r, 'rp_ratio')) && filled(val(r, 'fuel_min'))) },
  { id: 'tracks', label: 'Add your home track and the tracks you race at', article: 'tracks', link: '/tracks?tab=all', race: true, done: (c) => has(c, 'team_track', (r) => val(r, 'link') === 'Linked') },
  { id: 'engine', label: 'Add your engines', article: 'assets', link: '/r/asset/new?category=Engine', race: true, done: (c) => has(c, 'asset', (r) => val(r, 'category') === 'Engine') },
  { id: 'shocks', label: 'Add your shocks with position and adjustable type', article: 'assets', link: '/r/asset/new?category=Shock', race: true, done: (c) => has(c, 'asset', (r) => val(r, 'category') === 'Shock' && filled(val(r, 'position')) && filled(val(r, 'adjust_type'))) },
  { id: 'schedule', label: 'Set up a service schedule', article: 'maintenance', link: '/maintenance', race: true, done: (c) => has(c, 'schedule') },
  { id: 'event', label: 'Plan your racing year — pull your series and track dates into the Calendar', article: 'calendar', link: '/calendar?tab=shared', race: true, done: (c) => has(c, 'event') },
  { id: 'setup', label: 'Fill in your first setup sheet', article: 'setup-sheets', link: '/events', race: true, done: (c) => has(c, 'setup') },
  { id: 'shop', label: 'Set your labour rate, tax and terms', article: 'shop-settings', link: '/team/members', shop: true, admin: true, done: (c) => !!c.settings?.shop },
  { id: 'customer', label: 'Add a customer and their engine', article: 'customers', link: '/customers', shop: true, done: (c) => has(c, 'customer') && has(c, 'asset', (r) => filled(val(r, 'customer'))) },
  { id: 'job', label: 'Open your first job', article: 'shop-jobs', link: '/r/job/new', shop: true, done: (c) => has(c, 'job') },
];

/** The steps that apply to this team type, each with done: true/false. */
export function checklistFor(ctx) {
  const tt = ctx.teamType || 'race';
  return CHECKLIST.filter((s) => (!s.race || tt !== 'engine_shop') && (!s.shop || tt !== 'race'))
    .map((s) => ({ ...s, done: !!s.done(ctx) }));
}
