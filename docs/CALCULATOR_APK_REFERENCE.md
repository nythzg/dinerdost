# Q114 · extracted calculator reference

## Reference identity and method

On 23 October 2026 the receiving user explicitly requested downloading the supplied APK and extracting its functionality. The authorized Discord attachment was downloaded and inspected locally with Python ZIP readers and Androguard 4.1.3. Manifest/resources were decoded and calculation helpers were decompiled for inspection. The APK was **never installed or executed**. APK/decompiled vendor code and analysis dependencies remain outside the repository in local scratch storage; no vendor source or assets were added to the app.

- Package: `com.coloros.calculator`; app: Calculator; version **16.4.2**; version code `16004002`.
- Archive: **17,258,713 bytes**, 2,858 ZIP entries.
- SHA-256: `a91f4463878d58bb0e7014dd024bcd7faea91bb5e7b7034c0ab7f2615df1d1d6`.
- Manifest: Android minimum SDK 30, target SDK 36, 23 declared activities.
- Source: [APK message](https://discord.com/channels/@me/1491679750610096259/1562846350469627924), [exact-parity instruction](https://discord.com/channels/@me/1491679750610096259/1562846352743071805).
- Inspection method: [Androguard documentation](https://androguard.readthedocs.io/en/latest/intro/gettingstarted.html). Static output is evidence for functions/control flow, not proof of runtime interaction or numerical parity.

## Recovered functionality

| Group | Recovered functions | Evidence |
|---|---|---|
| Standard arithmetic | Addition, subtraction, multiplication, division, decimal input, parentheses, percent, equals, clearing and deleting input | Operation resources; expression/token parser `o2.c`; calculator activity |
| Scientific arithmetic | Square, square root, arbitrary powers, factorial, powers of ten, exponential, natural/base-10 logarithms | `desc_fun_*`/`desc_op_*` resources; `o2.c.A/w/y`; unified-real implementation `o2.w` |
| Trigonometry/constants | sin/cos/tan and inverse functions, degree/radian switch, π and e | Function resources, parser dispatch and angle-conversion branches |
| Number bases | Binary, octal, decimal, hexadecimal; digit validation, grouping and fractional conversions | `BaseConvertActivity`, `h3.f`, `h3.g1` |
| Fixed unit conversion | Length, area, volume, weight, temperature, speed, pressure, power | Eight declared conversion activities; eight coefficient assets; shared conversion code |
| Currency | Search/select currencies, convert and refresh exchange rates, network/error handling | Exchange-rate activity and explicit network-dependent resource text |
| Mortgage | Commercial, housing provident fund (HPF) and combined/portfolio loans; equal-installment and equal-principal repayment paths; schedules, totals and interest | Mortgage activities, network models, view model `k3.f` and loan model classes |
| History/editing | History listing/deletion, copy result, restricted arithmetic paste | History and paste resources; expression editing and history database references |
| Native integration | Mini/floating window, device/rotation/tablet layouts, voice feedback/plugin download, system settings integration | Mini activity, manifest permissions, native widget classes and voice resources |

The reference also contains privacy/about/open-source/feedback and update flows. These are app infrastructure rather than new restaurant workflows. Voice reads keys/results and depends on a separately downloaded plugin; the APK does not establish a web speech-recognition feature.

## Fixed unit inventory

| Category | Entries |
|---|---:|
| Length | 26 |
| Area | 17 |
| Volume | 17 |
| Weight | 20 |
| Temperature | 5 |
| Speed | 7 |
| Pressure | 13 |
| Power | 10 |
| Total | **115** |

These are physical conversion coefficients, not restaurant prices or exchange rates. Length asset version is `20260303`; the other seven asset versions are `20241010`. Preserve these as reference versions, not current financial-rate claims. Several coefficients are rounded in the original asset and must not silently be described as mathematically exact constants.

## Calculation details established from code

- Shared proportional converter `h3.e.a`: normalize displayed input, divide by the source coefficient to 15 decimal places using `BigDecimal` rounding mode 5 (**HALF_DOWN**), then multiply by the target coefficient. Its boolean branch optionally rounds the final result to four places using mode 4 (**HALF_UP**); trailing zeros are removed. This helper is not sufficient to establish every screen's selected branch or display precision.
- Temperature `h3.h1.E1`: normalize to Celsius, then convert to the destination. Kelvin subtracts/adds 273.15; Fahrenheit uses `(F − 32) / 1.8` and `C × 1.8 + 32`; Réaumur uses ×1.25 to Celsius and ×0.8 from Celsius; Rankine uses `R × 5/9 − 273.15` and `(C + 273.15) × 9/5`. Double constants were decoded from their IEEE-754 bit patterns rather than copied as misleading integer values from decompiler output.
- Parser `o2.c`: exponent recursion, unary minus, postfix factorial/square/percent, implicit multiplication, and multiplication/division before addition/subtraction are present. Resource IDs were resolved against the actual APK's public table rather than guessed from obfuscated method names.
- Percentage: ordinary postfix percent and a separate relative-percentage addition/subtraction path both exist. The latter's guard was traced through `h3.i0.w → lazy h3.g0.invoke → h3.i0.f → h3.i0.x`, which returns true in this APK. For a qualifying numeric-percent operand, addition/subtraction uses a multiplier of `1 ± operand/100`: the recovered model gives `200 + 10% = 220` and `200 − 10% = 180`; multiplication still uses ordinary percent. The parser's lookahead limits which expressions qualify. Diner Dost's existing generic postfix-only implementation differs; a future parity change needs explicit regression coverage, including saved-history behavior.
- Factorial `o2.w.C`: rejects negative/non-integral values, checks argument bit length, then uses arbitrary-precision arithmetic. The existing JavaScript calculator's numeric limits do not establish parity with this engine.
- Equal-installment helper `k3.f.s`: for nonzero denominator, payment is `P × r × (1+r)^n / ((1+r)^n − 1)`. Other mortgage paths handle schedules and equal-principal repayment separately. Rates/defaults/zero-interest edge behavior cannot be inferred from that one formula.

## Verification and implementation boundary

Extraction integrity checks passed: archive hash/identity, eight assets, 115 unique-per-category entries, positive proportional coefficients, the five temperature identifiers, operator ID mapping and four representative proportional conversion examples. Those examples validate a model of recovered data; they do **not** execute the Android app.

Q114 remains **reference investigated, implementation/parity pending**. This extraction materially improves the operation specification but does not establish gestures, all mode defaults, repeat-equals behavior, precision/overflow presentation or all financial edge cases. No calculator capability has been added to the web app by this inspection. Existing user-scoped notes/history remain intact.

External providers, native voice/floating-window behavior and assumed mortgage/currency rates remain deferred under the user's original scope. Do not copy the APK's network endpoints, credentials, market-specific defaults or proprietary assets into Diner Dost. Any web implementation must preserve existing calculator authorization/history and verify its supported calculation rules in the green desktop/phone UI before being marked complete.
