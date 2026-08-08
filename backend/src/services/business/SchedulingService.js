/**
 * SchedulingService — facade
 * Implementation split into ./scheduling/*Methods.js
 * Public API unchanged (static methods via Object.assign).
 *
 * Modules:
 * - calendarMethods: calendar, overrides, impact analysis
 * - scheduleMethods: calculate/fill/reschedule/batch schedule
 * - timeMethods: work-minute advance & date helpers
 * - ganttMethods: gantt data for UI
 */

const calendarMethods = require('./scheduling/calendarMethods');
const scheduleMethods = require('./scheduling/scheduleMethods');
const timeMethods = require('./scheduling/timeMethods');
const ganttMethods = require('./scheduling/ganttMethods');

class SchedulingService {}

Object.assign(
  SchedulingService,
  calendarMethods,
  scheduleMethods,
  timeMethods,
  ganttMethods
);

module.exports = SchedulingService;
