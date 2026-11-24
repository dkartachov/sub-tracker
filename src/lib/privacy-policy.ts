/**
 * The privacy policy shown in the app (Settings > Privacy policy) and published to GitHub Pages by
 * `site/build.mjs`. Keep it in step with what the app actually stores and sends; the same text is
 * what the store listing links to. Turning on Android Auto Backup, for one, changes it.
 */

/** Fill in before release. */
export const DEVELOPER_NAME = 'Hogos';
export const CONTACT_EMAIL = 'support@hogos.dev';
export const POLICY_UPDATED = '24 November 2026';

export type PolicySection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
};

export const PRIVACY_POLICY: PolicySection[] = [
  {
    heading: 'Who we are',
    paragraphs: [
      `Subtracker is a subscription tracking app made by ${DEVELOPER_NAME}. To ask about your data, email ${CONTACT_EMAIL}.`,
    ],
  },
  {
    heading: 'What Subtracker stores',
    bullets: [
      'Your subscriptions: the names, categories, prices and price changes, billing cycles, first payment, cancellation and resume dates, free trials, reminder choices and notes you enter.',
      'App settings: your currency, theme, reminder time and list sort order.',
      'Subtracker has no accounts, so it never asks for your name, email address or payment details.',
    ],
  },
  {
    heading: 'Where your data is kept',
    paragraphs: [
      "Everything you enter is kept only in the app's database on your phone. It is never sent to us or to any server. Android's own app backup is turned off for Subtracker, so your data is not copied to your Google account either.",
    ],
  },
  {
    heading: 'Backups and exports',
    paragraphs: [
      "When you tap Export backup or Export spreadsheet in Settings, Subtracker hands the text to your phone's share sheet, and it goes only where you choose to send it, such as Drive, email or a notes app. That app's own privacy policy then applies. Restoring a backup reads the text you paste in and nothing else.",
    ],
  },
  {
    heading: 'Notifications and the widget',
    bullets: [
      'Renewal and trial reminders are scheduled on your phone. Subtracker sends no push notifications, and notifications are the only permission it asks for.',
      'The home-screen widget shows your monthly total and next charges, so anyone who sees your home screen can see them too. Remove the widget to hide them.',
    ],
  },
  {
    heading: 'What Subtracker does not do',
    paragraphs: [
      'Subtracker has no ads and no analytics or tracking. It does not use your location, camera, microphone, contacts or bank accounts, and it does not sell your data or share it with anyone.',
    ],
  },
  {
    heading: 'Who else handles your data',
    paragraphs: [
      "Expo delivers app updates: when Subtracker opens, it asks Expo's update service whether a newer version is available. That request carries technical details: the app version and platform, a random ID made for this installation of the app (not tied to your phone or any account), the details of a recent update that failed to start, if there was one, and, like any internet request, your IP address. Expo uses these to deliver updates and spot ones that fail. They never include your subscriptions or settings. Google Play distributes the app under its own privacy policy.",
    ],
  },
  {
    heading: 'Deleting your data',
    bullets: [
      'Delete a subscription from its page to remove it and its history.',
      "Uninstalling Subtracker, or clearing its storage in Android's settings, removes all of its data from your phone.",
      'Backups you exported are yours: delete them wherever you saved them.',
    ],
  },
  {
    heading: 'Children',
    paragraphs: [
      'Subtracker is not intended for children under 13, and we do not knowingly collect information from children.',
    ],
  },
  {
    heading: 'Changes to this policy',
    paragraphs: [
      `If this policy changes, the date at the top changes too. This policy was last updated on ${POLICY_UPDATED}.`,
    ],
  },
];
