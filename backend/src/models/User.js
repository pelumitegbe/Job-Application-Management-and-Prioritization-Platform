const mongoose = require('mongoose');

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
