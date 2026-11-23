const mongoose = require('mongoose');
const { isValidTimeZone } = require('../utils/timezone');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      // Creates a database-level unique index on email.
      unique: true,
    },
    passwordHash: {
      type: String,
      required: true,
      // Excluded from query results unless explicitly requested with
      // .select('+passwordHash') (only the login flow does this).
      select: false,
    },
    // IANA time zone used to decide "today" for priority scoring. No default is
    // stored: a missing value means the user hasn't chosen one yet, and the
    // effective time zone is UTC (see utils/timezone.js effectiveTimeZone).
    timezone: {
      type: String,
      trim: true,
      validate: {
        validator: (value) => value === undefined || value === null || isValidTimeZone(value),
        message: 'timezone must be a valid IANA time zone identifier.',
      },
    },
  },
  { timestamps: true }
);

// Safety net: never serialize the password hash, even if it was selected.
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    delete ret.passwordHash;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
