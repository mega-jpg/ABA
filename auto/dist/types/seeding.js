"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.randomDelay = randomDelay;
/** Generate human-like random delay between min and max seconds */
function randomDelay(minSec, maxSec) {
    return Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec;
}
