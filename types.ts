
export interface ItineraryDay {
  day: number;
  title: string;
  description: string;
  activities: string[];
  location: string;
  imageUrl?: string;
}

export type ThemeType = 'luxe' | 'vanguard' | 'wanderlust';

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
  
  // Specific Motorcycle Tour Pricing Fields
  soloBikePrice?: string;
  dualRiderPrice?: string;
  ownBikePrice?: string;
  extraPrice?: string;
  dualSharingExtra?: string;
  singleRoomExtra?: string;
  
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
