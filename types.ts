
export interface ItineraryDay {
  day: number;
  title: string;
  description: string;
  activities: string[];
  location: string;
  imageUrl?: string;
}

export type ThemeType = 'luxe' | 'vanguard' | 'wanderlust';

export interface PricingRow {
  label: string;
  value: string;
}

export interface ThemeStyles {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  headingFont: string;
  headingWeight: string;
  headingStyle: 'normal' | 'italic';
  bodyFont: string;
  bodyWeight: string;
  bodyStyle: 'normal' | 'italic';
}

export interface TravelPackage {
  packageName: string;
  destination: string;
  duration: string;
  currency: string;
  
  // Dynamic Pricing instead of fixed fields
  pricing: PricingRow[];
  
  inclusions: string[];
  exclusions: string[];
  itinerary: ItineraryDay[];
  contactDetails?: string;
  terms?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  companyName?: string;
  theme: ThemeType;
  styles: ThemeStyles;
}

export interface AppState {
  step: 'upload' | 'edit' | 'preview';
  packageData: TravelPackage | null;
  isLoading: boolean;
  error: string | null;
}
