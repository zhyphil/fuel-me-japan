# Fuel Japan — M0 Analytics & Validation

Goal: prove unknown international travelers actually use the tool.

Events:
landing_view, locale_selected, find_fuel_click, location_requested, location_allowed, location_denied, station_view, gogo_click, navigate_click, my_fuel_start, my_fuel_success, my_fuel_unknown, refuel_guide_open, refuel_guide_complete, return_car_start, return_location_selected, return_station_selected, return_navigation_click, feedback_click.

Never attach raw precise lat/lon.

First experiment: ~500 relevant human visitors.

Precommitted directional thresholds (experiment rules, not industry benchmarks):
- >=25% start a core task.
- >=15% of station-detail users click navigation or gogo.
- Strong signals: repeat visits, Return flow use, unsolicited feedback, organic search growth.

Interpretation:
- traffic + low activation → positioning/UX issue
- activation + low action → usefulness/data issue
- high gogo clicks → demand for current station-level prices
- high My Fuel use → safety/decision value
- high Return use → prioritize that workflow

M0 monetization: none.
