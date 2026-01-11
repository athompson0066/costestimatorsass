
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AIWidget from './components/AIWidget';
import { supabase } from './services/supabaseClient';
import { BusinessConfig } from './types';

/**
 * SMART ENTRY POINT
 * This file detects if it should show the Full Builder or just the Widget.
 * It uses the URL parameter '?widget=1' to decide.
 */

const WidgetContainer = ({ initialConfig, widgetId }: { initialConfig: any, widgetId: string | null }) => {
  const [config, setConfig] = useState<BusinessConfig>(initialConfig);

  useEffect(() => {
    if (widgetId) {
      const fetchConfig = async () => {
        const { data, error } = await supabase
          .from('widgets')
          .select('config')
          .eq('id', widgetId)
          .single();
        
        if (!error && data?.config) {
          setConfig(data.config);
        }
      };
      fetchConfig();
    }
  }, [widgetId]);

  return (
    <div className="widget-only-mode">
      <AIWidget config={config as any} />
    </div>
  );
};

const init = () => {
  const rootElement = document.getElementById('root');
  if (!rootElement) return;

  // 1. Check for URL-based widget mode (Most reliable for Iframe embeds)
  const urlParams = new URLSearchParams(window.location.search);
  const isWidgetMode = urlParams.get('widget') === '1';
  const widgetId = urlParams.get('id');

  // 2. Fallback to global config (for legacy script-tag embeds)
  const windowConfig = (window as any).ESTIMATE_AI_CONFIG;
  const isWidgetOnly = isWidgetMode || (window as any).ESTIMATE_AI_WIDGET_ONLY === true;

  const root = ReactDOM.createRoot(rootElement);

  if (isWidgetOnly) {
    const defaultWidgetConfig = {
      name: 'SwiftFix Handyman',
      primaryColor: '#f97316',
      headerTitle: 'SwiftFix AI',
      headerSubtitle: 'Instant Quotes',
      profilePic: 'https://images.unsplash.com/photo-1581578731548-c64695cc6958?q=80&w=256&h=256&auto=format&fit=crop',
      hoverTitle: 'Get a Quote',
      widgetIcon: 'wrench',
      suggestedQuestions: ['Cost to paint a room?', 'Hourly rate?'],
      leadGenConfig: { enabled: true },
      pricingRules: 'Labor: $95/hr. Minimum: $150.',
    };

    const finalConfig = windowConfig || defaultWidgetConfig;

    // In widget mode, we remove the background so it floats nicely in the iframe
    document.body.style.background = 'transparent';
    
    root.render(
      <React.StrictMode>
        <WidgetContainer initialConfig={finalConfig} widgetId={widgetId} />
      </React.StrictMode>
    );
  } else {
    // Standard App Mode (Builder)
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  }
};

init();
