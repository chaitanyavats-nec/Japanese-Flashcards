// Milestones worth celebrating. Each badge checks a snapshot of the
// learner's progress; App awards any newly passed ones and shows a toast.
//
// ctx: { reviews, learnt, mastered, streak, goalDays, levelsComplete (Set of
//        tier numbers), customCount, speakingPasses, totalWords }
export const BADGES = [
  { id: 'first-review', title: 'First steps', description: 'Answer your first review', test: c => c.reviews >= 1 },
  { id: 'words-10', title: '10 words', description: 'Learn 10 words', test: c => c.learnt >= 10 },
  { id: 'words-50', title: '50 words', description: 'Learn 50 words', test: c => c.learnt >= 50 },
  { id: 'words-100', title: '100 words', description: 'Learn 100 words', test: c => c.learnt >= 100 },
  { id: 'words-250', title: '250 words', description: 'Learn 250 words', test: c => c.learnt >= 250 },
  { id: 'words-all', title: 'Whole deck', description: 'Learn every word in the deck', test: c => c.totalWords > 0 && c.learnt >= c.totalWords },
  { id: 'mastered-25', title: 'Long memory', description: 'Master 25 words (next review 3+ weeks away)', test: c => c.mastered >= 25 },
  { id: 'streak-3', title: '3-day streak', description: 'Study 3 days in a row', test: c => c.streak >= 3 },
  { id: 'streak-7', title: 'One week', description: 'Study 7 days in a row', test: c => c.streak >= 7 },
  { id: 'streak-30', title: 'One month', description: 'Study 30 days in a row', test: c => c.streak >= 30 },
  { id: 'goal-7', title: 'Goal getter', description: 'Meet your daily goal on 7 days', test: c => c.goalDays >= 7 },
  { id: 'level-1', title: 'Foundations', description: 'Learn every word in Level 1', test: c => c.levelsComplete.has(1) },
  { id: 'level-2', title: 'Everyday life', description: 'Learn every word in Level 2', test: c => c.levelsComplete.has(2) },
  { id: 'level-3', title: 'Wider vocabulary', description: 'Learn every word in Level 3', test: c => c.levelsComplete.has(3) },
  { id: 'level-4', title: 'Descriptive', description: 'Learn every word in Level 4', test: c => c.levelsComplete.has(4) },
  { id: 'own-card', title: 'Card maker', description: 'Add a word of your own', test: c => c.customCount >= 1 },
  { id: 'speaker', title: 'Out loud', description: 'Get a spoken answer right', test: c => c.speakingPasses >= 1 }
];

export const newlyEarned = (ctx, earned) => BADGES.filter(b => !earned[b.id] && b.test(ctx));
