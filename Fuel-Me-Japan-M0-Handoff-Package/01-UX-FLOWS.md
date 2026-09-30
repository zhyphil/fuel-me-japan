# Fuel Japan — M0 UX Flows

## Constraints
Mobile-first (~390×844). Action-first. UNKNOWN is an honest first-class state.

## Home
1. Find fuel near me
2. Return rental car
3. What fuel does my car need?
4. Help me refuel
Locale: EN / 繁中 / 한국어 / 简中 / ไทย

## Find Fuel
Home → explicit location request → regional static POI → Haversine sort → station list → station detail.
Detail may show name, brand, straight-line distance, known hours, Self/Full/Unknown, verified user fuel, prefectural reference price, gogo.gs outbound CTA if mapped, external Navigate CTA.

Never label straight-line distance as driving distance/time.

## My Fuel
Company optional → exact vehicle/variant → VERIFIED result or UNKNOWN.
UNKNOWN tells the user to check rental documentation/fuel-door label.

## How to Refuel
Sequential cards; retain Japanese labels users must recognize physically.

## Return Rental Car
Select company/return point → nearby final-fuel candidates → station → navigate → return navigation.

## Failure states
Location denied → manual prefecture/city.
No station → external map-search fallback.
Missing hours/service → UNKNOWN.
Missing gogo mapping → hide CTA.
Stale official price → show exact date, never pretend live.
