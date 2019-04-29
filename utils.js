const moment = require('moment');

const delay = ms => new Promise((r, j) => setTimeout(r, ms));

const log = msg => console.log(`[${moment().format('HH:mm:ss.SSS')}] ${msg}`);

module.exports = {
    delay,
    log
};