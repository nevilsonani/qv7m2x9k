# January 2026 pilot: what the wind forecast tells your desk

Scope: every GB day-ahead purchase decision made in January 2026 (auctions 1–31 Jan, delivery 2 Jan to 1 Feb),
national wind only. Forecasts: Elexon `WINDFOR`. Actuals: Elexon `FUELHH`, fuel type `WIND`. All figures below are
for the N2EX auction (gate closure 09:50 UK) unless stated. They are reproduced live in the app's Forecast accuracy
view and pinned by an automated test.

## 1. The forecast in hand at gate closure

At 09:50 the latest run is always the **09:30 run**, published 20 minutes before the gate. It covers the delivery day
(23:00 → 23:00) at lead times of **13.5 to 36.5 hours**.

| Metric (744 delivery hours) | Raw forecast |
|---|---|
| Mean absolute error (MAE) | **1.99 GW** (17.6% of mean output) |
| Mean error (bias) | **+1.73 GW** (+15.3%) |
| Hours over-forecast | **84%** |
| RMSE | 2.49 GW |
| P90 absolute error | 4.18 GW |
| Correlation with actual | 0.93 |
| Daily energy error | 43.0 GWh/day on average, of which +41.5 GWh/day is bias |

**Reading:** the forecast gets the *shape* of the wind right (correlation 0.93), but the *level* runs too high on most
days. Bought at face value, the desk would under-buy by about 15% of wind energy and cover the gap after the auction.

## 2. The gap grows with wind

| Forecast level | Share of forecast actually delivered |
|---|---|
| 0–5 GW | 95% |
| 5–10 GW | 90% |
| 10–15 GW | 88% |
| 15 GW and above | **85%** |

The over-forecast is roughly proportional to wind level. This is consistent with output being curtailed or constrained
in high-wind periods: metered output falls short of the weather-driven forecast. These two datasets alone cannot prove
the cause, and it is worth confirming with the client's own constraint data.

## 3. A simple, honest correction

Because the error is proportional, the app offers a **calibrated forecast**: raw forecast × *k*, where *k* = total actual
÷ total forecast over the 7 days before gate closure. It also offers an **80% range** built from the P10 and P90 of
actual ÷ forecast over the same window. Only information published before the gate is used.

| | Raw | Calibrated | Change |
|---|---|---|---|
| MAE | 1.99 GW | **1.34 GW** | **−32%** |
| Bias | +1.73 GW | +0.28 GW | −84% |
| Daily energy error | 43.0 GWh | 26.9 GWh | −37% |
| 80% range coverage | — | **80.2%** | target 80% |

The calibrated day-ahead forecast is more accurate than the **raw forecast published one hour before delivery**
(MAE 1.69 GW), and its range is well calibrated. This is a baseline to beat, not a final model.

## 4. Lead time

MAE of the raw forecast by how far ahead it was published:

| Lead time | 0 h | 6 h | 12 h | 24 h | 36 h | 48 h |
|---|---|---|---|---|---|---|
| MAE | 1.68 GW | 1.76 GW | 1.79 GW | 1.94 GW | 2.15 GW | 2.30 GW |

Error grows steadily with lead time, but most of the day-ahead error is bias, not lead time: even forecasts made
minutes before delivery are 1.7 GW out. Forecasts 48 hours ahead exist for only 79% of hours, because runs extend to
about 21:00 two days out.

## 5. Auction timing

Bidding into **EPEX at 09:20** means using the **07:30 run** instead of 09:30. Across January that costs little:
MAE 2.02 GW vs 1.99 GW. Auction choice can be driven by price and liquidity rather than forecast freshness.

## 6. Days that matter

- **Delivery Wed 28 Jan** (auction 27 Jan): forecast 271 GWh vs **143 GWh** delivered (+90%). Calibration reduced the
  miss to +65%. Runs published after the gate had already moved down by 61.5 GWh, a signal the desk could only act on
  intraday.
- Under-forecasts happen too: for delivery 19 Jan the forecast was 25% *below* what was delivered, so the range matters in both directions.

## Method notes

- Error = forecast − actual, matched on the hour start. The hourly forecast is compared with the actual for the
  half-hour starting on the hour. Daily energy uses every half-hour (actual × 0.5 h) and every forecast hour (× 1 h).
- Forecast rows for hours already past at publication are excluded.
- A 7-day warm-up before 1 January is loaded only to calibrate the first decisions; it is not part of any statistic.
- Limitations: one winter month, national metered wind only. Embedded wind and demand are out of scope by design.
