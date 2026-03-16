// server/utils/meshLogger.js
// In-memory logger for real-time mesh activity

const events = [];
const MAX_EVENTS = 20;

module.exports = {
    log(msg) {
        const event = {
            timestamp: Date.now(),
            msg: String(msg)
        };
        events.unshift(event);
        if (events.length > MAX_EVENTS) {
            events.pop();
        }
        
        // Also log to console for debugging
        const yellow = '\x1b[33m';
        const reset = '\x1b[0m';
        console.log(`${yellow}[Activity Logger]${reset} ${msg}`);
    },

    getEvents() {
        return events;
    },

    clear() {
        events.length = 0;
    }
};
