# Fuel Japan — M0 Implementation Plan

## M0.0 Foundation
Repo, Cloudflare deployment, five locales, source registry, analytics abstraction, mobile components.
Acceptance: production URL + locale switching + no backend/database.

## M0.1 Find Fuel
OSM/Geofabrik importer, regional JSON, geolocation, Haversine list, station detail, official-reference component, optional gogo link, navigation, attribution.
Acceptance: real stations; UNKNOWN never fabricated; manual fallback; zero runtime Overpass dependency.

## M0.2 My Fuel
Verified vehicle mapping + selection + Japanese labels + safe UNKNOWN.
Acceptance: ambiguous/unverified vehicle never receives guessed fuel.

## M0.3 How to Refuel
Concise field flow + localized authoritative safety copy.
Acceptance: usable on phone beside pump; five locales; Japanese labels visible.

## M0.4 Return Rental Car
Return-location dataset + nearby final-fuel candidates + navigation sequence + rule/receipt reminders only when supported.
Acceptance: complete station→return task without internal routing engine.

## STOP LINE
After M0.4: STOP BUILDING. Deploy, acquire traffic, measure.
No Highway Mode, accounts, price crowdsourcing, AI, subscriptions or route engine before evidence review.

## Backlog
Highway mode; community verification; station foreign-card confirmations; English-menu confirmations; route-aware detours; partner live prices; PWA enhancements; monetization.
