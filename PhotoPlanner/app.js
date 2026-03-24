// ─── LEGACY — this file is no longer part of the build ───────────────────────
//
// The application was refactored into the modular js/ structure.
// The build entry point is now js/main.js (see build.js JS_FILES list).
//
// Module map:
//   app.js (this file)      → superseded
//   js/state.js             → global state object
//   js/utils.js             → fmtTime, fmtDuration, deg, toDeg, showToast, ...
//   js/main.js              → initMap, tab navigation, dayjs plugin init
//   js/location.js          → setLocation, searchLocation, autoDetectTimezone
//   js/sunpath.js           → drawSunPath, drawTimeIndicator, updatePlannerInfo
//   js/sunmoon.js           → updateSunMoon
//   js/milkyway.js          → updateMilkyWay
//   js/weather.js           → fetchWeather, updateWeatherDisplays
//   js/calculators.js       → calcDOF, calcExposure, calcTimelapse, ...
//   js/finder.js            → searchAlignments, renderFinderResults
//   js/ar.js                → openARView / AR overlay
//   js/target.js            → setTarget, updateTargetInfo
//   js/datetime.js          → initDatePickers, buildDateSlider
//   js/timeline.js          → drawTimelineOverlay
//   js/compass.js           → compass canvas
//   js/celestial.js         → getGalacticCenterPos (astronomy math)
//   js/geo.js               → calcBearing, calcDistanceKm
//   js/mapcontrols.js       → map layer controls, moon viewer
//   js/favorites.js         → saved locations
//   js/skyview.js           → sky dome overlay
