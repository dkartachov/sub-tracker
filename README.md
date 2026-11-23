# Subtracker

Track your subscriptions (Netflix, the climbing gym, software, anything you pay for regularly): what they cost per month and year, what's charging soon, when free trials end, and how prices have changed. Everything stays on the phone.

Android app built with Expo (SDK 58), Expo Router and EAS.

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

## Features

- **Overview**: average monthly and yearly cost, trials ending soon (with the day to cancel by) and trials that just turned paid, charges in the next 30 days, cost per category, a bar chart of the last 12 months and what you've spent this calendar year.
- **Subscriptions**: running ones and cancelled ones below them, sorted by next charge, cost per month or name, with search once there are a few.
- **Adding one**: suggestions for common services fill in the category and billing cycle. Prices are always typed in.
- **Free trials**: a subscription with "Free trial" on is free until its first payment date and is shown as a trial until then. Its page says how many free days are left, and that it turned paid for a week after it does.
- **Cancelling**: from today, from when the paid period ends (the next charge), or from any other day, past days included for a cancellation noted late.
- **Resuming**: a cancelled subscription resumes from a chosen day (today, a past day, or one ahead), optionally at a new price. Nothing is counted for the time it was cancelled, and renewals count on from the resume day.
- **Changing plan**: "Change plan" switches the billing cycle (monthly to yearly, say) from a given day, optionally at a new price. Charges before it keep the old cycle. Once there's more than one plan or a resume, the subscription's page lists its billing history, and a long press removes a plan change or a resume.
- **Charge history**: each subscription lists the charges it has made.
- **Renewal reminders**: a local notification at a time picked in Settings (9:00 by default), 0, 1, 3 or 7 days before each charge, set per subscription. Trials get a "trial ends" reminder before they convert.
- **Price history**: "Change price" on a subscription records a new price from a given day on. Past charges keep the old price, so totals stay correct, and an announced future increase can be entered early.
- **One currency**, picked in Settings. Changing it doesn't convert amounts. Yen prices are whole amounts.
- **Backup**: Settings exports a backup as text through the share sheet (to Drive, email, a notes app), restored by pasting it back in, and a CSV for spreadsheets. Backups from before billing periods (format version 1) still restore.
- **Home-screen widget** ("Next charges", 4×2, resizable): the monthly total and the next three charges. Its layout (`src/widgets/upcoming-widget.tsx`) runs in the widget's own runtime and can't read the database, so `WidgetSync` pushes the numbers with `updateSnapshot` (from `src/lib/widget-snapshot.ts`) whenever the subscriptions or currency change, at midnight while the app is open, and when it goes to the background. Between launches it shows what it was last sent, with dates rather than "tomorrow" so it doesn't go wrong overnight. Tapping it doesn't open the app yet: `expo-widgets` 58 has no tap-to-launch action on Android.

## Later: features that need native code

Their native modules are already in the build (`expo-file-system`, `expo-sharing`, `expo-document-picker`), so the backup can ship as an OTA update to a build that includes them. Auto Backup changes the Android manifest, so it needs a new build:

- **File-based backup**: export to a `.json` file and pick one to restore, with `expo-file-system`, `expo-sharing` and `expo-document-picker`, replacing the copy-and-paste text backup.
- **Android Auto Backup**: `android.allowBackup` is `false` in `app.json`. Turning it on lets Android back the database up to the user's Google account and restore it on a new phone. Scheduled reminders aren't restored with it, but `ReminderScheduler` sets them again on the first launch.

## Data model

Three tables, in `src/db/schema.ts`:

- `subscriptions`: name, category, `is_trial`, `reminder_days_before` (null when off) and notes.
- `billing_periods`: `start_date` (the period's first charge), billing cycle (`cycle_count` × `cycle_unit`: day/week/month/year) and `end_date` (null while it runs on). Every subscription has at least one. A resume after a cancellation adds one starting later than the last one ended; a plan change ends the current one on the day the new one starts.
- `price_changes`: `amount` (hundredths of the currency unit, for every currency, yen included) and the `effective_date` it applies from. Every subscription has at least one: the first covers every charge up to the next change.

The rules (all in `src/lib/billing.ts`):

- Each billing period charges on its `start_date` and then every cycle after it, until its `end_date` or the next period's start, whichever is first. Each date is computed from the period's start, so monthly plans keep their day: from Jan 31 they charge Feb 28, then Mar 31.
- A charge costs the latest price whose `effective_date` is on or before the charge date. Prices run across periods.
- The last period's `end_date` is the cancellation. Until that day it's still running (it "ends" then), and from it on it's cancelled, until a later period starts. Marking a subscription cancelled keeps its history in the totals; deleting it removes the history too.
- A trial is `is_trial` with its first period's `start_date` still in the future.
- The add and edit form sets the first period's start and the last period's cycle, which for a subscription with one period is simply its billing.

Reminders follow the database: `ReminderScheduler` reschedules them whenever the subscriptions change, the currency or reminder time changes, or the app comes to the foreground. Only notifications that need to change are touched. Each subscription keeps its next 3 reminders scheduled.

Screens read today's date from `useToday` (`src/hooks/use-today.ts`), never `todayKey()` while rendering, so they move on at midnight while the app is open.

Settings other than the currency and theme (reminder time, list sort order) go through `storedSetting` in `src/lib/stored-setting.ts`.

## Tests

Logic tests sit next to the code they test. Tests that render and drive screens are in `src/ui-tests/`, outside `src/app` so Expo Router doesn't take them for routes. They run against the same in-memory database.

## Icons

`npm run icons` draws every icon, the splash image and the notification icon into `assets/images` from `scripts/make-icons.mjs`. The script has no dependencies, so edit the drawing there and run it again.
