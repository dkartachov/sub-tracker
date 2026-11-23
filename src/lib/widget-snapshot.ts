/**
 * What the home-screen widget shows, worked out from the subscriptions. Pure, like the Overview it
 * draws from, so the two agree. The widget itself only lays the strings out.
 */
import type { Subscription } from '@/db/subscriptions';
import type { UpcomingWidgetProps } from '@/widgets/upcoming-widget';

import { firstPaymentDate } from './billing';
import { formatMoney, type Currency } from './currency';
import { formatShortDate, type DateKey } from './dates';
import { getOverview } from './spending';

/** More than the widget shows, in case a resized one fits more later. */
const CHARGES_SENT = 6;

export function widgetSnapshot(subs: Subscription[], currency: Currency, today: DateKey): UpcomingWidgetProps {
  const overview = getOverview(subs, today);
  return {
    monthly: formatMoney(Math.round(overview.monthly), currency),
    upcoming: overview.upcoming.slice(0, CHARGES_SENT).map(({ sub, date, amount }) => {
      const isTrialEnd = sub.isTrial && date === firstPaymentDate(sub);
      const day = formatShortDate(date, today);
      return { name: sub.name, when: isTrialEnd ? `Trial ends ${day}` : day, amount: formatMoney(amount, currency), isTrialEnd };
    }),
    emptyText: subs.length === 0 ? 'Add your subscriptions in Subtracker.' : 'No charges in the next 30 days.',
  };
}
