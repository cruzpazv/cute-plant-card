# Changelog

## 0.2.1

- Typing a species in the visual editor no longer spends the Perenual quota on every keystroke: the lookup waits until typing stops, and other edits keep the species data.
- Fixing a wrong Perenual API key takes effect straight away instead of showing "no data" until the next day. The cache key holds a hash of the API key, never the key itself.
- Rain `binary_sensor`: a Home Assistant restart no longer counts as rain. Rain this browser saw is remembered.
- Monstera holes are cut into the leaves, so they look right on transparent and blurred themes. Two cuts per side.
- `hot_temperature` and `cold_temperature` work when written as quoted numbers in YAML.
- A watering time in the future (clock skew) counts as now: no more "8d" on a 7-day plant.
- Screen readers: the plant is a single button, and ✓ / ✕ have names.
- Faster with `device_id` / `plant_entity` on large installs: the entity registry is no longer scanned on every update.
- Minimum Home Assistant version is now 2024.11, the first with the 3 × 2 default size.

## 0.2.0

- Sensor readings are now chips in the top row, styled like the days chip, between the badges and the countdown. They never overlap: chips that don't fit are left out (hover the card or open the sensor to see them), and the plant moves down to make room. Out-of-range values turn red.
- Long plant names wrap onto up to three lines instead of being cut, and the plant drawing shrinks to make room.
- Visual editor: switches that are on by default (show name, light needs, confirm, sensor chips) now show as on. Default values are left out of the YAML.

## 0.1.2

- Rain no longer piles up clouds: while it rains the plant gets rain drops, the chip turns blue and there are no extra clouds under the corner badges. The rain badge now only means "it has rained since the last watering".
- The scorching sun sits behind the plant, top centre, instead of under the chip.

## 0.1.1

- Fix: the "Watered it?" box stayed on screen after answering (its `display:flex` beat the `hidden` attribute).

## 0.1.0

- First release: ten plant types, six moods (including scorched), plant-sensor bubbles, rain and temperature aware watering, Perenual species lookup, visual editor (en/es).
