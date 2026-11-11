// Pure unit tests for job application validation, the JobApplication schema
// and the Mongoose error mapping in the central error handler.
// No HTTP server and no database.

const { test, describe, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const {
  validateCreateApplication,
  validateUpdateApplication,
  validateObjectId,
  validatePagination,
  parseIsoDate,
} = require('../src/validators/applicationValidators');
const JobApplication = require('../src/models/JobApplication');
const errorHandler = require('../src/middleware/errorHandler');

describe('validateCreateApplication', () => {
  test('returns only known fields, trimmed and converted', () => {
    const { errors, value } = validateCreateApplication({
      company: ' Acme ',
      position: ' Dev ',
      deadline: '2026-11-30',
      followUpDate: '2026-11-20T15:30:00-05:00',
      interestLevel: 4,
      jobUrl: ' https://acme.example/jobs/1 ',
      notes: '  keep my indentation  ',
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(value, {
      company: 'Acme',
      position: 'Dev',
      jobUrl: 'https://acme.example/jobs/1',
      deadline: new Date('2026-11-30T00:00:00.000Z'),
      followUpDate: new Date('2026-11-20T20:30:00.000Z'),
      interestLevel: 4,
      notes: '  keep my indentation  ',
    });
  });

  test('omits status and interestLevel when absent so schema defaults apply', () => {
    const { value } = validateCreateApplication({ company: 'A', position: 'B' });
    assert.deepEqual(value, { company: 'A', position: 'B' });
  });

  test('accepts the boundary values', () => {
    const { errors } = validateCreateApplication({
      company: 'x'.repeat(150),
      position: 'x'.repeat(150),
      location: 'x'.repeat(200),
      notes: 'x'.repeat(5000),
      interestLevel: 1,
      jobUrl: 'http://localhost:3000/job',
    });
    assert.deepEqual(errors, []);
  });

  test('rejects arrays and null bodies', () => {
    assert.deepEqual(validateCreateApplication([]).errors, ['Request body must be a JSON object.']);
    assert.deepEqual(validateCreateApplication(null).errors, ['Request body must be a JSON object.']);
  });

  test('distinguishes protected fields from unknown fields', () => {
    const { errors } = validateCreateApplication({ company: 'A', position: 'B', user: 'x', extra: 1 });
    assert.deepEqual(errors, ['user cannot be set by the client.', 'Unknown field: extra.']);
  });

  test('rejects values of the wrong type instead of converting them', () => {
    const { errors } = validateCreateApplication({
      company: ['A'], position: { $ne: '' }, status: ['Saved'], interestLevel: '3', location: 5, notes: true,
    });
    assert.equal(errors.length, 6);
  });
});

describe('validateUpdateApplication', () => {
  test('splits changes into set and unset', () => {
    const { errors, value } = validateUpdateApplication({ status: 'Offer', deadline: null, notes: '' });
    assert.deepEqual(errors, []);
    assert.deepEqual(value, { set: { status: 'Offer' }, unset: ['deadline', 'notes'] });
  });

  test('rejects an empty body and a non-object body', () => {
    assert.match(validateUpdateApplication({}).errors[0], /at least one field/);
    assert.match(validateUpdateApplication(undefined).errors[0], /JSON object/);
  });

  test('does not allow required fields or defaults to be cleared', () => {
    const { errors } = validateUpdateApplication({ company: null, position: '', status: null, interestLevel: null });
    assert.equal(errors.length, 4);
  });
});

describe('parseIsoDate', () => {
  test('accepts date-only and full ISO 8601 strings', () => {
    assert.equal(parseIsoDate('2028-02-29').toISOString(), '2028-02-29T00:00:00.000Z');
    assert.equal(parseIsoDate('2026-11-30T17:00:00Z').toISOString(), '2026-11-30T17:00:00.000Z');
    assert.equal(parseIsoDate('2026-11-30T17:00:00.123+01:00').toISOString(), '2026-11-30T16:00:00.123Z');
  });

  test('rejects impossible, ambiguous and non-string dates', () => {
    for (const value of ['2026-02-29', '2026-04-31', '2026-00-10', '2026-11-30T17:00:00', '30-11-2026', 'Nov 30 2026', '', 1767225600000, null, {}]) {
      assert.equal(parseIsoDate(value), null, String(value));
    }
  });
});

describe('validateObjectId', () => {
  test('accepts exactly 24 hex characters', () => {
    assert.deepEqual(validateObjectId('6650F1C2A1B2C3D4E5F60718').errors, []);
  });

  test('rejects wrong lengths, non-hex characters and non-strings', () => {
    for (const id of ['aaaaaaaaaaaa', '123', `${'a'.repeat(24)}0`, 'z'.repeat(24), '', undefined, 42]) {
      assert.equal(validateObjectId(id).errors.length, 1, String(id));
    }
  });
});

describe('validatePagination', () => {
  test('defaults to page 1, limit 20', () => {
    assert.deepEqual(validatePagination({}).value, { page: 1, limit: 20 });
  });

  test('parses valid values and enforces the 100 maximum', () => {
    assert.deepEqual(validatePagination({ page: '3', limit: '100' }).value, { page: 3, limit: 100 });
    assert.match(validatePagination({ limit: '101' }).errors[0], /at most 100/);
  });

  test('rejects leading zeros, signs, decimals and repeated parameters', () => {
    for (const page of ['01', '+1', '-1', '1.0', '1e3', ' 1', ['1', '2']]) {
      assert.equal(validatePagination({ page }).errors.length, 1, JSON.stringify(page));
    }
  });
});

describe('JobApplication schema', () => {
  const owner = new mongoose.Types.ObjectId();

  test('applies defaults and requires user, company and position', async () => {
    const doc = new JobApplication({});
    assert.equal(doc.status, 'Saved');
    assert.equal(doc.interestLevel, 3);
    await assert.rejects(doc.validate(), (err) => {
      assert.deepEqual(Object.keys(err.errors).sort(), ['company', 'position', 'user']);
      return true;
    });
  });

  test('enforces status, interestLevel, URL and length rules', async () => {
    const doc = new JobApplication({
      user: owner, company: 'x'.repeat(151), position: 'P', status: 'Ghosted', interestLevel: 2.5, jobUrl: 'ftp://x.example',
    });
    await assert.rejects(doc.validate(), (err) => {
      assert.deepEqual(Object.keys(err.errors).sort(), ['company', 'interestLevel', 'jobUrl', 'status']);
      return true;
    });
  });

  test('the owner cannot be changed once set', () => {
    const doc = new JobApplication({ user: owner, company: 'A', position: 'B' });
    doc.$isNew = false; // simulate a document loaded from the database
    doc.user = new mongoose.Types.ObjectId();
    assert.equal(doc.user.toString(), owner.toString());
  });

  test('declares an owner-scoped index for the newest-first list query', () => {
    const indexes = JobApplication.schema.indexes().map(([fields]) => fields);
    assert.deepEqual(indexes, [{ user: 1, createdAt: -1, _id: -1 }]);
  });

  test('has timestamps and serializes id/user as strings without _id or __v', () => {
    assert.ok(JobApplication.schema.path('createdAt'));
    assert.ok(JobApplication.schema.path('updatedAt'));
    const json = new JobApplication({ user: owner, company: 'A', position: 'B' }).toJSON();
    assert.equal(json.user, owner.toString());
    assert.equal(typeof json.id, 'string');
    assert.equal(json._id, undefined);
    assert.equal(json.__v, undefined);
  });
});

describe('errorHandler: Mongoose errors', () => {
  function run(err) {
    const res = {
      statusCode: null,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    errorHandler(err, {}, res, () => {});
    return res;
  }

  test('ValidationError becomes 400 with only the custom field messages', async () => {
    const doc = new JobApplication({ user: new mongoose.Types.ObjectId(), position: 'P', status: 'Ghosted' });
    const err = await doc.validate().catch((e) => e);
    const res = run(err);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /^Validation failed: /);
    assert.match(res.body.message, /company is required\./);
    assert.match(res.body.message, /status must be one of/);
    assert.ok(!res.body.message.includes('Ghosted'), 'submitted value is not echoed');
  });

  test('CastError becomes a generic 400 without Mongoose internals', () => {
    const err = new mongoose.Error.CastError('ObjectId', 'bad-value', '_id');
    const res = run(err);
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, {
      status: 'error',
      message: 'Validation failed: _id has an invalid value.',
      errors: { _id: '_id has an invalid value.' }, // field-level errors (approved in Milestone 3B)
    });
  });

  test('other errors still become a generic 500', () => {
    const consoleError = mock.method(console, 'error', () => {});
    try {
      const res = run(new Error('database exploded: mongodb+srv://secret@host'));
      assert.equal(res.statusCode, 500);
      assert.deepEqual(res.body, { status: 'error', message: 'Internal server error' });
    } finally {
      consoleError.mock.restore();
    }
  });
});
