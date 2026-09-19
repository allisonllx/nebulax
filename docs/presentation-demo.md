# Lift outage + crowded platform demo

Open **Presentation demo / 演示控制台** at the bottom of the connected app. The main controls focus on `hard_for_him`.

1. Click **1. Show original route / 1. 显示原路线**. This turns off any simulation, requests a fresh Ang Mo Kio → Tan Tock Seng Hospital train journey for tomorrow at 10:00, and replaces the saved journey on this device. The main page shows the original route, transport instructions, departure time and arrival estimate. If no train option is returned, preparation reports a failure.
2. Show the original journey before departure.
3. Click **2. Lift outage + crowded platform / 2. 模拟电梯维修 + 站台拥挤**. The backend simulates Novena Exit A lift maintenance and crowded platforms, then checks the saved route.
4. When a suitable replacement is returned, it is saved immediately and the app returns to the main page, with the same origin and destination, updated map, transport instructions and timing. There is no comparison screen or acceptance button in this demo. A short notice explains why the route changed. The old route overlay is removed from the updated preview.
5. Start the journey to show the new step-by-step directions, or click step 1 to repeat the before-and-after presentation.

If the backend cannot find a suitable alternative, the original route stays visible and starting it is blocked with a request to seek help. Missing condition data is reported as unknown; failed requests do not replace the saved route.

**Other demo controls / 其他演示选项** contains return-to-live and offline simulation. Returning to live conditions turns off the backend scenario but keeps the saved route; use step 1 to prepare the original again. Offline simulation pauses app journey updates without disconnecting the device or testing uncached map tiles.

Scenarios affect everyone connected to the same backend process and remain active until turned off. Route planning and feeds not overridden by the scenario still need internet/API access. The alternative and extra travel time depend on the provider’s returned candidates. Platform crowding does not establish seating availability on an alternative. Actual accessibility remains subject to verification.

Other backend scenarios remain available via the API, but are intentionally absent from this focused demo panel. The prototype-only demo controls remain separate.
