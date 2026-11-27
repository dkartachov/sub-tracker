import { suggestTemplates } from './templates';

it('suggests popular ones until something is typed', () => {
  expect(suggestTemplates('').map((t) => t.name)).toContain('Netflix');
});

it('matches the start of any word, ignoring case', () => {
  expect(suggestTemplates('spo').map((t) => t.name)).toEqual(['Spotify']);
  expect(suggestTemplates('game').map((t) => t.name)).toEqual(['Xbox Game Pass']);
  expect(suggestTemplates('apple t').map((t) => t.name)).toEqual(['Apple TV+']);
});

it('suggests bills for a bill and subscriptions for a subscription', () => {
  expect(suggestTemplates('', 'bill').map((t) => t.name)).toContain('Mortgage');
  expect(suggestTemplates('', 'bill').map((t) => t.name)).not.toContain('Netflix');
  expect(suggestTemplates('inter').map((t) => t.name)).toEqual([]);
  expect(suggestTemplates('inter', 'bill').map((t) => t.name)).toEqual(['Internet']);
});

it('stops once a template has been picked or nothing matches', () => {
  expect(suggestTemplates('netflix')).toEqual([]);
  expect(suggestTemplates('my climbing club')).toEqual([]);
});
