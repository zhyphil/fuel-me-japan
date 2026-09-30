# Fuel Japan — M0 Data Model

```ts
type TriState = 'YES' | 'NO' | 'UNKNOWN';
type ServiceType = 'SELF' | 'FULL' | 'UNKNOWN';

interface Station {
  id: string;
  osmType: 'node' | 'way' | 'relation';
  osmId: number;
  name?: string;
  originalBrand?: string;
  normalizedBrand?: string;
  lat: number;
  lon: number;
  address?: string;
  openingHours?: string;
  serviceType: ServiceType;
  paymentVisa: TriState;
  paymentMastercard: TriState;
  fuelRegular: TriState;
  fuelHighOctane: TriState;
  fuelDiesel: TriState;
  gogoUrl?: string;
  sourceUpdatedAt?: string;
}

interface OfficialReferencePrice {
  prefectureCode: string;
  fuelType: 'REGULAR' | 'HIGH_OCTANE' | 'DIESEL';
  priceJpy: number;
  surveyDate: string;
  publishedAt?: string;
  fetchedAt: string;
  sourceUrl: string;
}

interface VehicleFuelMapping {
  rentalCompany?: string;
  make: string;
  model: string;
  variant?: string;
  modelYearRange?: string;
  fuelType: 'REGULAR' | 'HIGH_OCTANE' | 'DIESEL' | 'UNKNOWN';
  verificationStatus: 'VERIFIED' | 'UNKNOWN';
  sourceUrl?: string;
  verifiedAt?: string;
}
```

Rules:
- Missing never becomes NO.
- UNKNOWN survives normalization.
- gogoUrl is not evidence of a price.
- Regional reference price is never stored as Station.price.
