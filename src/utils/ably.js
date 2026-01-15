const Ably = require("ably");

const ably = new Ably.Realtime({ key: process.env.ABLY_API_KEY });

module.exports = ably;
