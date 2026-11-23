# Subtracker

Track your subscriptions (Netflix, the climbing gym, software, anything you pay for regularly): what they cost per month and year, what's charging soon, when free trials end, and how prices have changed. Everything stays on the phone.

Android app built with Expo (SDK 58), Expo Router and EAS, set up like `mobility-app`.

## Running it

```bash
npm install
npm start            # dev server for the development build (APP_VARIANT=development)
npm test             # Jest
npm run lint
npm run typecheck
```

The app uses native modules that aren't in Expo Go (notifications, date picker), so install a development build first: `npm run build:dev`.

### First-time EAS setup

The project isn't linked to EAS yet. Once, while logged in to the `hogos` account:

```bash
npx eas-cli@latest init               # creates the EAS project and adds extra.eas.projectId to app.json
npx eas-cli@latest update:configure   # adds updates.url to app.json
```

After that the same scripts work as in mobility-app: `build:dev|preview|prod` and `update:dev|preview|prod`.

## Features

- **Overview**: average monthly and yearly cost, trials ending soon, charges in the next 30 days, cost per category and what you've spent this calendar year.
- **Subscriptions**: running ones sorted by their next charge, and cancelled ones below them.
- **Free trials**: a subscription with "Free trial" on is free until its first payment date and is shown as a trial until then.
- **Renewal reminders**: a local notification at 9:00, 0, 1, 3 or 7 days before each charge, set per subscription. Trials get a "trial ends" reminder before they convert.
- **Price history**: "Change price" on a subscription records a new price from a given day on. Past charges keep the old price, so totals stay correct, and an announced future increase can be entered early.
- **One currency**, picked in Settings. Changing it doesn't convert amounts.

## Data model

Two tables, in `src/db/schema.ts`:

- `subscriptions`: name, category, billing cycle (`cycle_count` × `cycle_unit`: day/week/month/year), `first_payment_date`, `is_trial`, `cancelled_on`, `reminder_days_before` (null when off) and notes.
- `price_changes`: `amount` (minor units) and the `effective_date` it applies from. Every subscription has at least one: the first covers every charge up to the next change.

The rules (all in `src/lib/billing.ts`):

- A subscription charges on `first_payment_date` and then every cycle after it. Each date is computed from the first payment, so monthly plans keep their day: from Jan 31 they charge Feb 28, then Mar 31.
- A charge costs the latest price whose `effective_date` is on or before the charge date.
- Nothing charges on or after `cancelled_on`. Marking a subscription cancelled keeps its history in the totals; deleting it removes the history too.
- A trial is `is_trial` with a `first_payment_date` still in the future.

Reminders follow the database: `ReminderScheduler` reschedules them whenever the subscriptions change, the currency changes or the app comes to the foreground. Only notifications that need to change are touched. Each subscription keeps its next 3 reminders scheduled.

## Icons

`npm run icons` draws every icon, the splash image and the notification icon into `assets/images` from `scripts/make-icons.mjs`. The script has no dependencies, so edit the drawing there and run it again.
