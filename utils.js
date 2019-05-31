const moment = require('moment');
const readline = require('readline');

const delay = ms => new Promise((r, j) => setTimeout(r, ms));

const log = msg => console.log(`[${moment().format('HH:mm:ss.SSS')}] ${msg}`);

// startTime is the start time of the event in milliseconds.
const displayCountdown = startTime => {

    const formatNumber = number => {
        if (number < 10) {
            return `0${number}`;
        } else {
            return number;
        }
    }

    let interval = setInterval(() => {
        if (moment().valueOf() >= startTime) {
            clearInterval(interval);
        } else {
            let secondsToGo = Math.round((startTime / 1000)) - moment().unix();
            readline.clearLine(process.stdout, 0);
            readline.cursorTo(process.stdout, 0);

            process.stdout.write(
                `${formatNumber(Math.floor(secondsToGo/(60*60)))}:` +
                `${formatNumber(Math.floor( (secondsToGo/60) % 60 ))}:` +
                `${formatNumber(Math.floor(secondsToGo % 60))}`
            );
        }
    },
    1000);
}

module.exports = {
    delay,
    log,
    displayCountdown
};