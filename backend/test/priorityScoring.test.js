// Unit tests for the pure priority scoring engine (no database, no HTTP).

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  scoreApplication,
  rankApplications,
  categorize,
  calendarDaysUntil,
  WEIGHTS,
} = require('../src/services/priorityScoring');

// Fixed reference instant: mid-afternoon UTC on 2026-11-23.
const REF = new Date('2026-11-23T15:30:00.000Z');

/** ISO date (midnight UTC, as the backend stores YYYY-MM-DD) `n` calendar days from REF. */
function day(n) {
  const d = new Date(Date.UTC(2026, 10, 23 + n));
  return d.toISOString();
}

function app(overrides = {}) {
  return { id: '000000000000000000000001', status: 'Saved', interestLevel: 3, ...overrides };
}

const score = (overrides) => scoreApplication(app(overrides), REF);

describe('deadline urgency (D)', () => {
  const cases = [
    [0, 100, 'Application deadline is today.'],
    [1, 90, 'Application deadline is in 1 day.'],
    [2, 90, 'Application deadline is in 2 days.'],
    [3, 70, 'Application deadline is in 3 days.'],
    [7, 70, 'Application deadline is in 7 days.'],
    [8, 40, 'Application deadline is in 8 days.'],
    [14, 40, 'Application deadline is in 14 days.'],
    [15, 20, 'Application deadline is in 15 days.'],
    [30, 20, 'Application deadline is in 30 days.'],
    [31, 10, 'Application deadline is in 31 days.'],
    [365, 10, 'Application deadline is in 365 days.'],
  ];
  for (const [daysAway, expected, explanation] of cases) {
    test(`Saved, deadline in ${daysAway} day(s) -> ${expected}`, () => {
      const { factors } = score({ deadline: day(daysAway) });
      assert.equal(factors.deadline.score, expected);
      assert.equal(factors.deadline.explanation, explanation);
      assert.equal(factors.deadline.expired, false);
    });
  }

  test('missing deadline -> 0', () => {
    const { factors, explanations } = score({});
    assert.equal(factors.deadline.score, 0);
    assert.equal(factors.deadline.daysUntil, null);
    assert.ok(explanations.includes('No application deadline is set.'));
  });

  test('expired deadline -> 0, flagged and explained (not treated as overdue)', () => {
    const { factors, explanations } = score({ deadline: day(-1) });
    assert.equal(factors.deadline.score, 0);
    assert.equal(factors.deadline.expired, true);
    assert.equal(factors.deadline.daysUntil, -1);
    assert.ok(explanations.includes('Application deadline has passed (1 day ago).'));
    assert.ok(!explanations.some((e) => /overdue/i.test(e)));

    assert.equal(score({ deadline: day(-40) }).factors.deadline.explanation, 'Application deadline has passed (40 days ago).');
  });

  for (const status of ['Applied', 'Interviewing', 'Offer', 'Rejected']) {
    test(`${status}: deadline urgency is 0 and no urgency message is generated`, () => {
      const { factors, explanations } = score({ status, deadline: day(1) });
      assert.equal(factors.deadline.score, 0);
      assert.equal(factors.deadline.applies, false);
      assert.ok(!explanations.some((e) => /deadline is (today|in)/.test(e)));
    });
  }
});

describe('follow-up urgency (F)', () => {
  const cases = [
    [-5, 100, 'Follow-up is overdue by 5 days.'],
    [-1, 100, 'Follow-up is overdue by 1 day.'],
    [0, 100, 'Follow-up is due today.'],
    [1, 85, 'Follow-up is due in 1 day.'],
    [2, 85, 'Follow-up is due in 2 days.'],
    [3, 60, 'Follow-up is due in 3 days.'],
    [7, 60, 'Follow-up is due in 7 days.'],
    [8, 30, 'Follow-up is due in 8 days.'],
    [14, 30, 'Follow-up is due in 14 days.'],
    [15, 10, 'Follow-up is due in 15 days.'],
    [90, 10, 'Follow-up is due in 90 days.'],
  ];
  for (const [daysAway, expected, explanation] of cases) {
    test(`follow-up ${daysAway} day(s) away -> ${expected}`, () => {
      const { factors } = score({ status: 'Applied', followUpDate: day(daysAway) });
      assert.equal(factors.followUp.score, expected);
      assert.equal(factors.followUp.explanation, explanation);
      assert.equal(factors.followUp.overdue, daysAway < 0);
    });
  }

  test('missing follow-up date -> 0', () => {
    const { factors } = score({ status: 'Applied' });
    assert.equal(factors.followUp.score, 0);
    assert.equal(factors.followUp.explanation, 'No follow-up date is set.');
  });

  test('follow-up applies regardless of stage (except that Rejected scores 0 overall)', () => {
    for (const status of ['Saved', 'Applied', 'Interviewing', 'Offer']) {
      assert.equal(score({ status, followUpDate: day(0) }).factors.followUp.score, 100, status);
    }
  });
});

describe('stage (S) and interest (I)', () => {
  const stages = { Saved: 40, Applied: 60, Interviewing: 90, Offer: 100, Rejected: 0 };
  for (const [status, expected] of Object.entries(stages)) {
    test(`${status} -> ${expected}`, () => {
      assert.equal(score({ status }).factors.stage.score, expected);
    });
  }

  test('stage explanations describe the actual status', () => {
    assert.equal(score({ status: 'Interviewing' }).factors.stage.explanation, 'Application is currently in the interviewing stage.');
    assert.equal(score({ status: 'Offer' }).factors.stage.explanation, 'Application has reached the offer stage.');
  });

  for (const level of [1, 2, 3, 4, 5]) {
    test(`interest level ${level} -> ${level * 20}`, () => {
      const { factors } = score({ interestLevel: level });
      assert.equal(factors.interest.score, level * 20);
      assert.equal(factors.interest.explanation, `Interest level is ${level} out of 5.`);
    });
  }

  test('an invalid interest level (data integrity guard) contributes 0', () => {
    assert.equal(score({ interestLevel: undefined }).factors.interest.score, 0);
    assert.equal(score({ interestLevel: 9 }).factors.interest.score, 0);
  });
});

describe('final score', () => {
  test('weights are 0.40 / 0.25 / 0.20 / 0.15 and sum to 1', () => {
    assert.deepEqual(WEIGHTS, { deadline: 0.4, followUp: 0.25, stage: 0.2, interest: 0.15 });
    assert.equal(Object.values(WEIGHTS).reduce((a, b) => a + b, 0).toFixed(10), '1.0000000000');
  });

  test('worked example: Saved, deadline in 2 days, follow-up in 7 days, interest 4 -> 71 (High)', () => {
    const result = score({ deadline: day(2), followUpDate: day(7), interestLevel: 4 });
    // 0.40×90 + 0.25×60 + 0.20×40 + 0.15×80 = 36 + 15 + 8 + 12 = 71
    assert.equal(result.factors.deadline.contribution, 36);
    assert.equal(result.factors.followUp.contribution, 15);
    assert.equal(result.factors.stage.contribution, 8);
    assert.equal(result.factors.interest.contribution, 12);
    assert.equal(result.rawScore, 71);
    assert.equal(result.score, 71);
    assert.equal(result.category, 'High');
    assert.equal(result.explanations.length, 4);
  });

  test('highest possible Saved score: deadline today, follow-up overdue, interest 5 -> 88 (Critical)', () => {
    // 0.40×100 + 0.25×100 + 0.20×40 + 0.15×100 = 40 + 25 + 8 + 15 = 88
    const result = score({ deadline: day(0), followUpDate: day(-3), interestLevel: 5 });
    assert.equal(result.rawScore, 88);
    assert.equal(result.score, 88);
    assert.equal(result.category, 'Critical');
  });

  test('an Offer with an overdue follow-up and top interest -> 60', () => {
    // 0 + 25 + 20 + 15 = 60
    assert.equal(score({ status: 'Offer', followUpDate: day(-2), interestLevel: 5 }).score, 60);
  });

  test('full precision internally, rounded once at the end (x.5 rounds up)', () => {
    // Applied, follow-up in 1 day (85), interest 1: 0 + 21.25 + 12 + 3 = 36.25 -> 36
    const a = score({ status: 'Applied', followUpDate: day(1), interestLevel: 1 });
    assert.equal(a.rawScore, 36.25);
    assert.equal(a.score, 36);
    assert.equal(a.factors.followUp.contribution, 21.25);

    // Saved, deadline in 3 days (70), follow-up in 20 days (10), interest 1: 28 + 2.5 + 8 + 3 = 41.5 -> 42
    const b = score({ deadline: day(3), followUpDate: day(20), interestLevel: 1 });
    assert.equal(b.rawScore, 41.5);
    assert.equal(b.score, 42);
  });

  test('scores are always integers between 0 and 100', () => {
    const statuses = ['Saved', 'Applied', 'Interviewing', 'Offer', 'Rejected'];
    const offsets = [null, -10, -1, 0, 1, 2, 3, 7, 8, 14, 15, 30, 31];
    for (const status of statuses) {
      for (const d of offsets) {
        for (const f of offsets) {
          for (const interestLevel of [1, 3, 5]) {
            const { score: s, rawScore } = score({
              status,
              interestLevel,
              ...(d !== null && { deadline: day(d) }),
              ...(f !== null && { followUpDate: day(f) }),
            });
            assert.ok(Number.isInteger(s) && s >= 0 && s <= 100, `${status} ${d} ${f} ${interestLevel}: ${s}`);
            assert.ok(rawScore >= 0 && rawScore <= 100);
          }
        }
      }
    }
  });
});

describe('rejected applications', () => {
  test('always score 0 ("No action") even with urgent dates and top interest', () => {
    const result = score({ status: 'Rejected', deadline: day(0), followUpDate: day(-3), interestLevel: 5 });
    assert.equal(result.score, 0);
    assert.equal(result.category, 'No action');
    assert.ok(result.rawScore > 0, 'raw weighted sum is still reported for transparency');
    assert.equal(result.override, 'Rejected applications always score 0.');
    assert.deepEqual(result.explanations, ['Application is rejected and requires no further action.']);
    assert.equal(result.nextActionDate, null);
  });
});

describe('priority categories', () => {
  const boundaries = [
    [100, 'Critical'],
    [75, 'Critical'],
    [74, 'High'],
    [50, 'High'],
    [49, 'Medium'],
    [25, 'Medium'],
    [24, 'Low'],
    [1, 'Low'],
    [0, 'No action'],
  ];
  for (const [value, category] of boundaries) {
    test(`${value} -> ${category}`, () => assert.equal(categorize(value), category));
  }

  test('the category always matches the final score', () => {
    assert.equal(score({ status: 'Saved', interestLevel: 1 }).category, 'Low'); // 8 + 3 = 11
    assert.equal(score({ status: 'Interviewing', interestLevel: 5, followUpDate: day(0) }).category, 'High'); // 25 + 18 + 15 = 58
  });
});

describe('UTC calendar-day boundaries', () => {
  test('days are counted by UTC calendar date, not elapsed 24-hour periods', () => {
    const deadline = '2026-11-24T00:00:00.000Z';
    // 23:59:59 UTC on the 23rd: only 1 second before the deadline, but it's "tomorrow".
    assert.equal(calendarDaysUntil(deadline, new Date('2026-11-23T23:59:59.999Z')), 1);
    // 00:00:00 UTC on the 23rd: 24 hours before, still 1 calendar day.
    assert.equal(calendarDaysUntil(deadline, new Date('2026-11-23T00:00:00.000Z')), 1);
    // Any time on the 24th UTC: "today".
    assert.equal(calendarDaysUntil(deadline, new Date('2026-11-24T00:00:00.000Z')), 0);
    assert.equal(calendarDaysUntil(deadline, new Date('2026-11-24T23:59:59.999Z')), 0);
    // From the 25th UTC: passed by 1 day.
    assert.equal(calendarDaysUntil(deadline, new Date('2026-11-25T00:00:00.000Z')), -1);
  });

  test('a deadline stored with a time of day still counts by its UTC date', () => {
    assert.equal(calendarDaysUntil('2026-11-24T22:00:00.000Z', new Date('2026-11-24T01:00:00.000Z')), 0);
  });

  test('month, year and leap-day boundaries', () => {
    assert.equal(calendarDaysUntil('2026-12-01T00:00:00.000Z', new Date('2026-11-30T12:00:00Z')), 1);
    assert.equal(calendarDaysUntil('2027-01-01T00:00:00.000Z', new Date('2026-12-31T23:00:00Z')), 1);
    assert.equal(calendarDaysUntil('2028-03-01T00:00:00.000Z', new Date('2028-02-28T12:00:00Z')), 2); // 2028 is a leap year
  });

  test('the same application scores differently on different reference dates (no hidden clock)', () => {
    const application = app({ deadline: '2026-12-01T00:00:00.000Z' });
    assert.equal(scoreApplication(application, new Date('2026-11-30T09:00:00Z')).factors.deadline.score, 90);
    assert.equal(scoreApplication(application, new Date('2026-12-01T09:00:00Z')).factors.deadline.score, 100);
    assert.equal(scoreApplication(application, new Date('2026-12-02T09:00:00Z')).factors.deadline.score, 0);
  });

  test('a reference date is required', () => {
    assert.throws(() => scoreApplication(app(), undefined), /referenceDate/);
    assert.throws(() => scoreApplication(app(), new Date('nope')), /referenceDate/);
  });
});

describe('ranking', () => {
  const id = (n) => n.toString(16).padStart(24, '0');

  test('sorts by score, then earliest next action date, then id', () => {
    const applications = [
      // Applied, interest 3 = 0.20×60 + 0.15×60 = 12 + 9 = 21, plus any follow-up contribution.
      // Ids are chosen so each tie-break rule is exercised.
      { id: id(5), status: 'Applied', interestLevel: 3, followUpDate: day(20) }, // 2.5 + 12 + 9 = 23.5 -> 24, action +20
      { id: id(4), status: 'Applied', interestLevel: 3, followUpDate: day(16) }, // 24, action +16 (earlier)
      { id: id(3), status: 'Applied', interestLevel: 3 }, // 21, no action date
      { id: id(2), status: 'Applied', interestLevel: 3 }, // 21, no action date, smaller id
      { id: id(1), status: 'Interviewing', interestLevel: 5, followUpDate: day(0) }, // 25 + 18 + 15 = 58
      { id: id(6), status: 'Rejected', interestLevel: 5, followUpDate: day(0) }, // 0
    ];
    const ranked = rankApplications(applications, REF);
    assert.deepEqual(
      ranked.map((a) => [a.id, a.priority.score, a.priority.nextActionDate]),
      [
        [id(1), 58, '2026-11-23'],
        [id(4), 24, '2026-12-09'],
        [id(5), 24, '2026-12-13'],
        [id(2), 21, null],
        [id(3), 21, null],
        [id(6), 0, null],
      ]
    );
  });

  test('the next action date uses the earlier of follow-up and an applicable deadline', () => {
    assert.equal(score({ deadline: day(5), followUpDate: day(9) }).nextActionDate, '2026-11-28');
    assert.equal(score({ deadline: day(9), followUpDate: day(5) }).nextActionDate, '2026-11-28');
    assert.equal(score({ deadline: day(-2), followUpDate: day(5) }).nextActionDate, '2026-11-28'); // expired deadline ignored
    assert.equal(score({ status: 'Applied', deadline: day(1) }).nextActionDate, null); // deadline doesn't apply
    assert.equal(score({ status: 'Applied', followUpDate: day(-3) }).nextActionDate, '2026-11-20'); // overdue follow-up counts
  });

  test('ranking is deterministic regardless of input order', () => {
    const applications = Array.from({ length: 40 }, (_, i) => ({
      id: id(i + 1),
      status: ['Saved', 'Applied', 'Interviewing', 'Offer'][i % 4],
      interestLevel: (i % 5) + 1,
      ...(i % 3 === 0 && { deadline: day(i % 20) }),
      ...(i % 2 === 0 && { followUpDate: day((i % 11) - 3) }),
    }));
    const expected = rankApplications(applications, REF).map((a) => a.id);
    for (let shuffle = 0; shuffle < 5; shuffle += 1) {
      const shuffled = [...applications].sort(() => Math.random() - 0.5);
      assert.deepEqual(rankApplications(shuffled, REF).map((a) => a.id), expected);
    }
  });

  test('does not mutate the input and keeps all application fields', () => {
    const input = [{ id: id(1), company: 'Acme', position: 'Dev', status: 'Applied', interestLevel: 2 }];
    const [ranked] = rankApplications(input, REF);
    assert.equal(input[0].priority, undefined);
    assert.equal(ranked.company, 'Acme');
    assert.equal(ranked.priority.score, 18); // 12 + 6
  });

  test('an empty list ranks to an empty list', () => {
    assert.deepEqual(rankApplications([], REF), []);
  });
});
