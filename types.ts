
export interface MenuItem {
  label: string;
  url: string;
}

export interface ManualPriceItem {
  id: string;
  label: string;
  price: string;
  description?: string;
}

export interface LeadField {
  visible: boolean;
  required: boolean;
}

export interface LeadRecord {
  id: string;
  widget_id: string;
  name: string;
  email: string;
  phone: string;
  notes?: string;
  date?: string;
  time?: string;
  estimate_json: any;
  created_at: string;
}

export interface LeadGenConfig {
  enabled: boolean;
  destination: 'email' | 'webhook' | 'slack' | 'all';
  targetEmail: string;
  resendApiKey: string; // Added Resend API Key
  webhookUrl: string;
  googleSheetWebhookUrl: string;
  slackWebhookUrl: string;
  fields: {
    name: LeadField;
    email: LeadField;
    phone: LeadField;
    notes: LeadField;
    serviceType: LeadField;
    date: LeadField;
    time: LeadField;
  };
}

export type WidgetIconType = 'calculator' | 'wrench' | 'home' | 'sparkles' | 'chat';

export interface BusinessConfig {
  name: string;
  primaryColor: string;
  headerTitle: string;
  headerSubtitle: string;
  profilePic: string;
  hoverTitle: string;
  widgetIcon: WidgetIconType;
  services: string[];
  pricingRules: string;
  systemPrompt: string; 
  googleSheetUrl: string;
  useSheetData: boolean;
  pricingSource: 'manual' | 'sheet'; 
  corePricingItems: ManualPriceItem[]; 
  smartAddons: ManualPriceItem[]; 
  manualPriceList: ManualPriceItem[]; 
  suggestedQuestions: string[];
  leadGenConfig: LeadGenConfig;
  defaultLanguage: string;
}

export interface SavedWidget {
  id: string;
  name: string;
  config: BusinessConfig;
  updated_at: string;
}

export interface UpsellSuggestion {
  label: string;
  price: string;
  reason: string;
}

export interface EstimationResult {
  estimatedCostRange: string;
  baseMinCost: number;
  baseMaxCost: number;
  laborEstimate: string;
  materialsEstimate: string;
  timeEstimate: string;
  tasks: string[];
  recommendations: string[];
  caveats: string[];
  suggestedUpsells?: UpsellSuggestion[]; 
}

export interface EstimateTask {
  description: string;
  urgency: string;
  zipCode: string;
  language?: string;
  image?: string;
}

export enum WidgetState {
  CLOSED = 'CLOSED',
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  RESULT = 'RESULT',
  LEAD_FORM = 'LEAD_FORM',
  SUCCESS = 'SUCCESS'
}

export type AppTab = 'dashboard' | 'branding' | 'pricing' | 'prompt' | 'leads' | 'demo' | 'embed' | 'settings';
