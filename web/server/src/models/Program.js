'use strict';

/*
 * Program.js - the single stored document: a saved assembly program.
 * Exported as a factory so db.js can pass in the mongoose instance it
 * loaded, which keeps mongoose an optional dependency.
 */

module.exports = function createProgramModel(mongoose) {
  if (mongoose.models.Program) {
    return mongoose.models.Program;
  }

  const schema = new mongoose.Schema(
    {
      title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120
      },
      source: {
        type: String,
        required: true,
        maxlength: 100 * 1024
      },
      createdAt: {
        type: Date,
        default: Date.now,
        index: true
      }
    },
    { versionKey: false }
  );

  return mongoose.model('Program', schema);
};
