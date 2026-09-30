# Fuel Japan — M0 Product Spec
Status: FROZEN.

## Positioning
**Refuel in Japan without speaking Japanese.**

Target: international visitors renting/driving cars in Japan, initially prioritizing road-trip contexts such as Hokkaido, Okinawa and Kyushu.

## M0 UI languages
- English (`en`)
- 繁體中文 (`zh-Hant`)
- 한국어 (`ko`)
- 简体中文 (`zh-Hans`)
- ไทย (`th`)

Japanese remains a real-world recognition layer for pump/sign labels.

## Core jobs
### M0.1 Find Fuel
Explicit geolocation → nearby real stations → straight-line distance → known hours/service type → user's verified fuel type → official prefectural reference price → verified gogo.gs outbound link when available → external navigation.

### M0.2 My Fuel
Select rental vehicle → return only a VERIFIED fuel type → show Japanese pump label. UNKNOWN must never be guessed.

### M0.3 How to Refuel
Short mobile field guide using authoritative Japanese motoring/rental guidance and contextualizing instructions with the user's verified fuel.

### M0.4 Return Rental Car
Choose rental return point → final-fuel candidates → verified fuel reminder → applicable receipt/refueling rule → navigate to station → navigate to return.

## Explicitly OUT
Accounts, native apps, backend DB, own live-price DB, user price submissions, AI chat, payments, subscriptions, own navigation, route optimization, Highway Mode, prediction, coupon optimization and social features.

New ideas go to backlog. They do not change M0.
