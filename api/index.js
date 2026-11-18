'use strict';
// Vercel serverless entry: every non-static request is routed here (see vercel.json).
const { createApp } = require('../server');

module.exports = createApp();
