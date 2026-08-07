"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.randomDelay = randomDelay;
function randomDelay(minSec, maxSec) {
    return Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec;
}
