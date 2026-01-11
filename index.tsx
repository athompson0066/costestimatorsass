
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import AIWidget from './components/AIWidget';
import { supabase } from './services/supabaseClient';
import { BusinessConfig } from './types';

const WidgetContainer = ({ initialConfig, widgetId }: { initialConfig: any, widgetId: string | null }) => {
  const [config, setConfig] = useState<BusinessConfig>(initialConfig);

  useEffect(() => {
    if (widgetId) {
      const fetchConfig = async () => {
        try {
          const { data, error } = await supabase
            .from('widgets')
            .select('config')
            .eq('id', widgetId)
            .single();
          
          if (!error && data?.config) {
            setConfig(data.config);
          }
        } catch (e) {
          console.error("Failed to fetch widget config:", e);
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

  const urlParams = new URLSearchParams(window.location.search);
  const isWidgetMode = urlParams.get('widget') === '1';
  const widgetId = urlParams.get('id');
  const isWidgetOnly = isWidgetMode || (window as any).ESTIMATE_AI_WIDGET_ONLY === true;

  const root = createRoot(rootElement);

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

    const finalConfig = (window as any).ESTIMATE_AI_CONFIG || defaultWidgetConfig;
    document.body.style.background = 'transparent';
    
    root.render(
      <React.StrictMode>
        <WidgetContainer initialConfig={finalConfig} widgetId={widgetId} />
      </React.StrictMode>
    );
  } else {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
