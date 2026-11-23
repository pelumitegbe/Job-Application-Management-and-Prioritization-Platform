#!/usr/bin/env node
// Demo data for the DEVELOPMENT database: 20 realistic sample applications for
// an EXISTING user, so priority scoring can be demonstrated.
//
//   node scripts/demoData.js inspect                 read-only: database name + users and their application counts
//   node scripts/demoData.js seed   --email <email>  create the 20 demo applications (skips any that already exist)
//   node scripts/demoData.js verify --email <email>  call GET /api/applications and /priorities in-process
//   node scripts/demoData.js remove --email <email>  delete ONLY the demo applications
//
// Safety:
//   * Uses backend/.env (MONGODB_URI / MONGODB_DB_NAME) and refuses any database ending in "_test".
//   * Never creates users and never touches non-demo applications.
//   * Records are created through applicationService.createApplication after the same
//     validateCreateApplication checks as POST /api/applications, owned by the given user.
//   * Every demo record's notes start with "[DEMO DATA demo-NN]". Seeding skips keys that
//     already exist, so rerunning never creates duplicates; "remove" deletes by that tag.
//   * Dates are relative to today (UTC) when seeding.

const { once } = require('node:events');
const mongoose = require('mongoose');
const { loadConfig } = require('../src/config/env');
const User = require('../src/models/User');
const JobApplication = require('../src/models/JobApplication');
const applicationService = require('../src/services/applicationService');
const { validateCreateApplication } = require('../src/validators/applicationValidators');

const DEMO_TAG = '[DEMO DATA';
const DEMO_NOTES = /^\[DEMO DATA demo-\d{2}\]/;

/** YYYY-MM-DD for today (UTC) + n days. */
function day(n) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + n)).toISOString().slice(0, 10);
}

/** The 20 demo applications. Dates are relative so urgency varies on any day. */
function demoApplications() {
  const rows = [
    // Saved (5): deadline urgency applies
    { company: 'Google', position: 'Software Engineer Intern', status: 'Saved', location: 'Mountain View, CA', deadline: day(0), followUpDate: day(1), interestLevel: 5, jobUrl: 'https://careers.google.com/', note: 'Deadline is today; referral submitted by a former classmate.' },
    { company: 'NVIDIA', position: 'Machine Learning Engineer', status: 'Saved', location: 'Santa Clara, CA', deadline: day(6), followUpDate: day(-2), interestLevel: 5, note: 'Follow up with the recruiter (overdue) before applying.' },
    { company: 'Stripe', position: 'Backend Engineer', status: 'Saved', location: 'Remote (US)', deadline: day(2), interestLevel: 4, jobUrl: 'https://stripe.com/jobs', note: 'Payments infrastructure team; tailor resume to API design.' },
    { company: 'Airbnb', position: 'Full Stack Developer', status: 'Saved', location: 'San Francisco, CA', deadline: day(12), interestLevel: 3, note: 'Portfolio project on booking flows would fit well.' },
    { company: 'Databricks', position: 'Data Engineer', status: 'Saved', interestLevel: 2, note: 'No deadline posted yet; keep an eye on the careers page.' },
    // Applied (5)
    { company: 'Microsoft', position: 'Software Engineer II', status: 'Applied', location: 'Redmond, WA', applicationDate: day(-10), followUpDate: day(-5), interestLevel: 4, note: 'Applied via careers portal; follow-up email is overdue.' },
    { company: 'Amazon', position: 'Backend Engineer, AWS', status: 'Applied', location: 'Seattle, WA', applicationDate: day(-4), followUpDate: day(2), interestLevel: 3, note: 'Online assessment expected within a week.' },
    { company: 'Datadog', position: 'Site Reliability Engineer', status: 'Applied', location: 'New York, NY', applicationDate: day(-2), followUpDate: day(9), interestLevel: 3, note: 'Applied through LinkedIn Easy Apply.' },
    { company: 'Shopify', position: 'Full Stack Developer', status: 'Applied', location: 'Remote (Canada)', applicationDate: day(-15), followUpDate: day(20), interestLevel: 2, note: 'Rails + React stack.' },
    { company: 'Cloudflare', position: 'Systems Engineer', status: 'Applied', location: 'Austin, TX', applicationDate: day(-20), deadline: day(-25), interestLevel: 1, note: 'Posting has closed; waiting to hear back.' },
    // Interviewing (4)
    { company: 'Meta', position: 'Software Engineer, Infrastructure', status: 'Interviewing', location: 'Menlo Park, CA', applicationDate: day(-21), followUpDate: day(0), interestLevel: 5, note: 'Send thank-you note after today’s system design round.' },
    { company: 'Apple', position: 'iOS Software Engineer', status: 'Interviewing', location: 'Cupertino, CA', applicationDate: day(-18), followUpDate: day(-3), interestLevel: 4, note: 'Recruiter promised feedback; follow-up is overdue.' },
    { company: 'Netflix', position: 'Senior Backend Engineer', status: 'Interviewing', location: 'Los Gatos, CA', applicationDate: day(-12), followUpDate: day(5), interestLevel: 4, note: 'Onsite loop scheduled; prepare distributed systems examples.' },
    { company: 'Uber', position: 'Machine Learning Engineer', status: 'Interviewing', location: 'San Francisco, CA', applicationDate: day(-9), interestLevel: 3, note: 'Phone screen passed; no next date yet.' },
    // Offer (2)
    { company: 'Salesforce', position: 'Software Engineer', status: 'Offer', location: 'San Francisco, CA', applicationDate: day(-35), followUpDate: day(1), interestLevel: 4, note: 'Offer received; respond about start date tomorrow.' },
    { company: 'Atlassian', position: 'Full Stack Developer', status: 'Offer', location: 'Remote', applicationDate: day(-40), followUpDate: day(14), interestLevel: 3, note: 'Offer decision due in two weeks.' },
    // Rejected (4): always score 0 and are excluded from /priorities by default
    { company: 'Oracle', position: 'Backend Engineer', status: 'Rejected', location: 'Austin, TX', applicationDate: day(-30), followUpDate: day(-1), interestLevel: 2, note: 'Rejected after the technical screen.' },
    { company: 'IBM', position: 'Software Engineer Intern', status: 'Rejected', deadline: day(3), interestLevel: 3, note: 'Position filled internally.' },
    { company: 'Adobe', position: 'Frontend Engineer', status: 'Rejected', location: 'San Jose, CA', applicationDate: day(-25), interestLevel: 3, note: 'Rejected without interview.' },
    { company: 'Intel', position: 'Machine Learning Engineer Intern', status: 'Rejected', location: 'Hillsboro, OR', applicationDate: day(-28), interestLevel: 2, note: 'Not moving forward this cycle.' },
  ];
  return rows.map(({ note, ...fields }, i) => {
    const key = `demo-${String(i + 1).padStart(2, '0')}`;
    return { key, body: { ...fields, notes: `${DEMO_TAG} ${key}] ${note}` } };
  });
}

function parseArgs(argv) {
  const [command = 'inspect', ...rest] = argv;
  const options = {};
  for (let i = 0; i < rest.length; i += 1) if (rest[i] === '--email') options.email = rest[i + 1];
  return { command, options };
}

async function connect() {
  const config = loadConfig();
  if (config.mongodbDbName.endsWith('_test')) {
    throw new Error(`Refusing to run against "${config.mongodbDbName}": demo data is for the development database only.`);
  }
  await mongoose.connect(config.mongodbUri, { dbName: config.mongodbDbName, serverSelectionTimeoutMS: 8000 });
  console.log(`Connected to database: ${mongoose.connection.name}`);
}

async function findUser(email) {
  if (!email) throw new Error('Pass --email <account email>.');
  const user = await User.findOne({ email: email.trim().toLowerCase() });
  if (!user) throw new Error(`No existing user with that email. (This script never creates users.)`);
  return user;
}

async function inspect() {
  const users = await User.find({}, { name: 1, email: 1 }).lean();
  console.log(`Users: ${users.length}`);
  for (const user of users) {
    const apps = await JobApplication.find({ user: user._id }, { company: 1, position: 1, status: 1, notes: 1 }).lean();
    const demo = apps.filter((a) => DEMO_NOTES.test(a.notes || '')).length;
    console.log(`- ${user.email}  applications: ${apps.length} (demo: ${demo})`);
    for (const a of apps.filter((x) => !DEMO_NOTES.test(x.notes || ''))) console.log(`    · ${a.position} at ${a.company} [${a.status}]`);
  }
}

async function seed(email) {
  const user = await findUser(email);
  const existing = await JobApplication.find({ user: user._id, notes: { $regex: '^\\[DEMO DATA demo-' } }, { notes: 1 }).lean();
  const existingKeys = new Set(existing.map((a) => a.notes.match(/demo-\d{2}/)[0]));
  const before = await JobApplication.countDocuments({ user: user._id });

  let created = 0;
  let skipped = 0;
  for (const { key, body } of demoApplications()) {
    if (existingKeys.has(key)) {
      skipped += 1;
      continue;
    }
    const { errors, value } = validateCreateApplication(body); // same rules as POST /api/applications
    if (errors.length) throw new Error(`${key} is invalid: ${errors.join(' ')}`);
    await applicationService.createApplication(user._id.toString(), value);
    created += 1;
  }
  const after = await JobApplication.countDocuments({ user: user._id });
  console.log(`Applications before: ${before}, created: ${created}, skipped (already present): ${skipped}, after: ${after}`);
}

async function remove(email) {
  const user = await findUser(email);
  const { deletedCount } = await JobApplication.deleteMany({ user: user._id, notes: { $regex: '^\\[DEMO DATA demo-' } });
  console.log(`Deleted ${deletedCount} demo applications. Non-demo applications were not touched.`);
}

/** Calls the real endpoints in-process (real routes, auth middleware and services) with a short-lived token. */
async function verify(email) {
  const user = await findUser(email);
  const { signAccessToken } = require('../src/services/tokenService');
  const app = require('../src/app');
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = signAccessToken(user._id.toString()); // never printed
  const get = (path) => fetch(base + path, { headers: { Authorization: `Bearer ${token}` } }).then(async (r) => ({ status: r.status, body: await r.json() }));

  try {
    const list = await get('/api/applications?page=1&limit=100');
    const prio = await get('/api/applications/priorities?page=1&limit=100');
    const all = list.body.applications;
    const statusCounts = all.reduce((acc, a) => ({ ...acc, [a.status]: (acc[a.status] || 0) + 1 }), {});
    const demoCounts = all.filter((a) => DEMO_NOTES.test(a.notes || '')).reduce((acc, a) => ({ ...acc, [a.status]: (acc[a.status] || 0) + 1 }), {});

    console.log(`GET /api/applications            -> ${list.status}, total ${list.body.pagination.total}`);
    console.log(`GET /api/applications/priorities -> ${prio.status}, total ${prio.body.pagination.total} (reference date ${prio.body.scoring.referenceDate}, rejected excluded)`);
    console.log(`Status distribution (all):  ${JSON.stringify(statusCounts)}`);
    console.log(`Status distribution (demo): ${JSON.stringify(demoCounts)}`);

    const ranked = prio.body.applications;
    const scores = ranked.map((a) => a.priority.score);
    const sortedOk = scores.every((s, i) => i === 0 || scores[i - 1] >= s);
    console.log(`Distinct scores: ${new Set(scores).size} of ${scores.length}; ranking non-increasing: ${sortedOk}; any Rejected in ranking: ${ranked.some((a) => a.status === 'Rejected')}`);
    console.log('Ranking:');
    ranked.forEach((a, i) => {
      const demo = DEMO_NOTES.test(a.notes || '') ? '' : '  (your application)';
      console.log(`${String(i + 1).padStart(3)}. ${String(a.priority.score).padStart(3)}  ${a.priority.category.padEnd(9)} ${a.position} at ${a.company} [${a.status}]${demo}`);
      if (i < 5) console.log(`        ${a.priority.explanations.join(' ')}`);
    });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  await connect();
  try {
    if (command === 'inspect') await inspect();
    else if (command === 'seed') await seed(options.email);
    else if (command === 'verify') await verify(options.email);
    else if (command === 'remove') await remove(options.email);
    else throw new Error(`Unknown command "${command}". Use inspect | seed | verify | remove.`);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { demoApplications };
