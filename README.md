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
- **Charges around a day**: for ones billed around a day rather than on it (a coffee subscription charged the weekend after the 16th, say), "Charged" in the form says how late a charge can land: up to 3 days, a week or 2 weeks, never as long as the cycle. The first payment is set to the earliest day. Charges are then shown as a range ("Nov 16 – 23", "Renews by Nov 23"), one due a few days ago stays in the next charge and the Overview's next 30 days until its last day, and reminders come before the earliest day. While one is due now it hasn't been paid yet: it's "still to charge" in the 12-month chart, and left out of what was spent and of the subscription's charges, until it's marked paid or its last day has passed. "Mark as paid" on its page says it has landed, so it stops showing as due (in the lists, the Overview and the widget) and counts as paid from then. Long pressing it under Charges marks it not paid again. The monthly and yearly averages count it as usual.
- **Charge history**: each subscription lists the charges it has made, leaving out one that's due now and not yet paid.
- **Renewal reminders**: a local notification at a time picked in Settings (9:00 by default), 0, 1, 3 or 7 days before each charge, set per subscription. Trials get a "trial ends" reminder before they convert.
- **Price history**: "Change price" on a subscription records a new price from a given day on. Past charges keep the old price, so totals stay correct, and an announced future increase can be entered early.
- **Tax**: Settings has a tax region (EU countries, the UK, Switzerland, Norway, Australia, New Zealand, Japan, Canadian provinces, the US with a typed rate) that fills in the tax rate of new subscriptions, and whether prices include it (VAT, GST) or it's added on top (US and Canadian sales tax). Each subscription keeps its own rate, editable in its form. Tax added on top is in every amount shown and counted: totals, the chart, reminders, the widget and the CSV. The price history keeps prices as typed. Changing the region offers to move the subscriptions still on the old default over to it. The rates are in `src/constants/tax-regions.ts`, as of `TAX_RATES_CHECKED`: update them there when a country changes its rate.
- **One currency**, picked in Settings. Changing it doesn't convert amounts. Yen prices are whole amounts.
- **Backup**: Settings exports a backup as text through the share sheet (to Drive, email, a notes app), restored by pasting it back in, and a CSV for spreadsheets. Backups from before billing periods (format version 1), before charge windows (version 2), before tax (version 3) and before paid charges (version 4) still restore, older ones without tax.
- **Home-screen widget** ("Next charges", 4×2, resizable): the monthly total and the next three charges. Its layout (`src/widgets/upcoming-widget.tsx`) runs in the widget's own runtime and can't read the database, so `WidgetSync` pushes the numbers with `updateSnapshot` (from `src/lib/widget-snapshot.ts`) whenever the subscriptions or currency change, at midnight while the app is open, and when it goes to the background. Between launches it shows what it was last sent, with dates rather than "tomorrow" so it doesn't go wrong overnight. Tapping it doesn't open the app yet: `expo-widgets` 58 has no tap-to-launch action on Android.

## Later: features that need native code

Their native modules are already in the build (`expo-file-system`, `expo-sharing`, `expo-document-picker`), so the backup can ship as an OTA update to a build that includes them. Auto Backup changes the Android manifest, so it needs a new build:

- **File-based backup**: export to a `.json` file and pick one to restore, with `expo-file-system`, `expo-sharing` and `expo-document-picker`, replacing the copy-and-paste text backup.
- **Android Auto Backup**: `android.allowBackup` is `false` in `app.json`. Turning it on lets Android back the database up to the user's Google account and restore it on a new phone. Scheduled reminders aren't restored with it, but `ReminderScheduler` sets them again on the first launch.

## Data model

Four tables, in `src/db/schema.ts`:

- `subscriptions`: name, category, `is_trial`, `reminder_days_before` (null when off), `charge_window_days` (how many days after its billing day a charge can land, 0 for on the day), `tax_rate` (thousandths of a percent: 21% is 21000), `price_includes_tax` and notes.
- `billing_periods`: `start_date` (the period's first charge), billing cycle (`cycle_count` × `cycle_unit`: day/week/month/year) and `end_date` (null while it runs on). Every subscription has at least one. A resume after a cancellation adds one starting later than the last one ended; a plan change ends the current one on the day the new one starts.
- `paid_charges`: the billing day (`charge_date`) of each charge marked paid by hand. What's shown as still to come, what was spent and the charge list read it.
- `price_changes`: `amount` (hundredths of the currency unit, for every currency, yen included) and the `effective_date` it applies from. Every subscription has at least one: the first covers every charge up to the next change.

The rules (all in `src/lib/billing.ts`):

- Each billing period charges on its `start_date` and then every cycle after it, until its `end_date` or the next period's start, whichever is first. Each date is computed from the period's start, so monthly plans keep their day: from Jan 31 they charge Feb 28, then Mar 31.
- A charge costs the latest price whose `effective_date` is on or before the charge date. Prices run across periods.
- The last period's `end_date` is the cancellation. Until that day it's still running (it "ends" then), and from it on it's cancelled, until a later period starts. Marking a subscription cancelled keeps its history in the totals; deleting it removes the history too.
- A charge costs its price plus tax when `price_includes_tax` is off, rounded to the cent per charge (`withTax` in `src/lib/tax.ts`). That's the `amount` of every `Charge`. With tax included, the price is what's paid and the tax is only shown. The rate is the subscription's, not a dated history, so changing it changes past charges too.
- A trial is `is_trial` with its first period's `start_date` still in the future.
- With `charge_window_days`, each charge is still dated on its billing day, the earliest it can land, for the averages, which month it falls in and reminders. While it's due now (`isDueNow`) and not marked paid it hasn't landed (`hasLanded`): what's shown as still to come allows for it landing late (`nextExpectedCharge`, `expectedChargesBetween`), and what's been paid so far (`chargesLandedBy`, `spentBy`, and the chart's charged part) leaves it out until then. A trial still ends on its day.
- The add and edit form sets the first period's start and the last period's cycle, which for a subscription with one period is simply its billing.

Reminders follow the database: `ReminderScheduler` reschedules them whenever the subscriptions change, the currency or reminder time changes, or the app comes to the foreground. Only notifications that need to change are touched. Each subscription keeps its next 3 reminders scheduled.

Screens read today's date from `useToday` (`src/hooks/use-today.ts`), never `todayKey()` while rendering, so they move on at midnight while the app is open.

Settings other than the currency and theme (reminder time, list sort order, tax region and typed tax rate) go through `storedSetting` in `src/lib/stored-setting.ts`.

## Tests

Logic tests sit next to the code they test. Tests that render and drive screens are in `src/ui-tests/`, outside `src/app` so Expo Router doesn't take them for routes. They run against the same in-memory database.

## Privacy policy

The text lives in `src/lib/privacy-policy.ts`, shown in the app under Settings > Privacy policy. `site/build.mjs` (Node 24, `node site/build.mjs`) turns the same text into `site/dist/index.html`, and `.github/workflows/pages.yml` publishes it to GitHub Pages whenever it changes on `main`. That page is the URL for the Play Store listing. Update the policy when the app starts storing or sending something new.

### Play Console declarations

The Play Console's App content answers have to match the app and the policy. Update them in the same release as the change. Today they are:

- **Data safety**: collects data, encrypted in transit, no accounts. Device or other IDs (App functionality, Analytics) and Crash logs (Analytics), both collected and not shared, required, not ephemeral. All of it comes from `expo-updates`, which sends Expo an installation ID and failed-update details ([Expo's guide](https://docs.expo.dev/eas-update/store-privacy-declarations.md)). Exports through the share sheet are user-initiated, so they aren't declared. The tax region is picked in Settings and never leaves the phone, so it isn't collected location: Data safety only counts data sent off the device. Detecting it with GPS or a location permission, or sending it anywhere, would change that.
- **Financial features**: "My app doesn't provide any financial features". Subtracker only records what you type in.

Check them again when:

- **A dependency is added or upgraded** (`npx expo install`, or an SDK upgrade): look for the library's Play data safety notes. Analytics, crash reporting and ads SDKs always change Data safety.
- **Data starts leaving the phone**: cloud sync, accounts, Auto Backup (`android.allowBackup`), bank or card syncing. Update Data safety and the policy, and with accounts, the account deletion answers too.
- **Money starts moving or being read from a bank**: bank or card syncing, payments. Update Financial features. In-app purchases are declared elsewhere, but may change Data safety.
- **A new permission is added** (location, camera, contacts): update Data safety, and the policy's "What Subtracker does not do".

Whenever the policy text changes, update `POLICY_UPDATED` too. Pushing to `main` republishes the page.

## Updating tax rates

The rates in `src/constants/tax-regions.ts` are plain data, so a change ships as an over-the-air update (`npm run update:prod`) without a store release. Check them every quarter (rate changes usually take effect on Jan 1, Apr 1, Jul 1 or Oct 1):

1. Check each rate against the official source: for the EU, the European Commission's "VAT rates applied in the Member States" and its Taxes in Europe Database; the national tax authorities for the UK, Switzerland, Norway, Australia, New Zealand and Japan; the Canada Revenue Agency for GST/HST, Revenu Québec for the QST, and the BC, Manitoba and Saskatchewan finance ministries for PST/RST on digital services. Use the standard rate for digital services in force today, not an announced one.
2. Change the rate, and set `TAX_RATES_CHECKED` to this month even when nothing changed.
3. Run the tests: `src/lib/tax.test.ts` checks the table is valid.

Subscriptions keep the rate they were given. When an update changes the rate of someone's region, `TaxRateCheck` (in the root layout) asks once whether to move the subscriptions still on the old rate over to it.

## Icons

`npm run icons` draws every icon, the splash image and the notification icon into `assets/images` from `scripts/make-icons.mjs`. The script has no dependencies, so edit the drawing there and run it again.
