const mongoose = require('mongoose');

// Ordered by pipeline stage. The future prioritization algorithm will map
// each stage to an importance score (S); nothing is calculated here yet.
const APPLICATION_STATUSES = ['Saved', 'Applied', 'Interviewing', 'Offer', 'Rejected'];

const LIMITS = {
  company: 150,
  position: 150,
  location: 200,
  jobUrl: 2048,
  notes: 5000,
};

function isHttpUrl(value) {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

const jobApplicationSchema = new mongoose.Schema(
  {
    // Owner. Always set from the verified JWT, never from client input,
    // and cannot be changed after creation.
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'user is required.'],
      immutable: true,
    },
    company: {
      type: String,
      required: [true, 'company is required.'],
      trim: true,
      maxlength: [LIMITS.company, `company must be at most ${LIMITS.company} characters.`],
    },
    position: {
      type: String,
      required: [true, 'position is required.'],
      trim: true,
      maxlength: [LIMITS.position, `position must be at most ${LIMITS.position} characters.`],
    },
    status: {
      type: String,
      required: [true, 'status is required.'],
      default: 'Saved',
      enum: {
        values: APPLICATION_STATUSES,
        message: `status must be one of: ${APPLICATION_STATUSES.join(', ')}.`,
      },
    },
    location: {
      type: String,
      trim: true,
      maxlength: [LIMITS.location, `location must be at most ${LIMITS.location} characters.`],
    },
    jobUrl: {
      type: String,
      trim: true,
      maxlength: [LIMITS.jobUrl, `jobUrl must be at most ${LIMITS.jobUrl} characters.`],
      validate: {
        validator: isHttpUrl,
        message: 'jobUrl must be a valid http or https URL.',
      },
    },
    // Dates used by the future prioritization algorithm:
    // deadline -> deadline urgency (D), followUpDate -> follow-up urgency (F).
    applicationDate: { type: Date },
    deadline: { type: Date },
    followUpDate: { type: Date },
    // User interest (I) in the future prioritization algorithm.
    interestLevel: {
      type: Number,
      default: 3,
      min: [1, 'interestLevel must be an integer from 1 to 5.'],
      max: [5, 'interestLevel must be an integer from 1 to 5.'],
      validate: {
        validator: Number.isInteger,
        message: 'interestLevel must be an integer from 1 to 5.',
      },
    },
    notes: {
      type: String,
      maxlength: [LIMITS.notes, `notes must be at most ${LIMITS.notes} characters.`],
    },
  },
  { timestamps: true }
);

// Supports the owner-scoped list query: { user } sorted by newest first.
// Single-document lookups use { _id, user }, which the default _id index serves.
jobApplicationSchema.index({ user: 1, createdAt: -1, _id: -1 });

jobApplicationSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    ret.user = ret.user.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const JobApplication = mongoose.model('JobApplication', jobApplicationSchema);

module.exports = JobApplication;
module.exports.APPLICATION_STATUSES = APPLICATION_STATUSES;
module.exports.LIMITS = LIMITS;
module.exports.isHttpUrl = isHttpUrl;
